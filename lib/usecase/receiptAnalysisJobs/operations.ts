import type {
  ReceiptAnalysisScheduler,
  ReceiptAnalysisStore,
} from "../../domain/receiptAnalysisJobs/store";
import type {
  ReceiptAnalysisBatchRecord,
  ReceiptAnalysisJobRecord,
  ReceiptAnalysisJobStatus,
} from "../../domain/receiptAnalysisJobs/records";
import {
  canCancelReceiptAnalysisJob,
  canRetryReceiptAnalysisJob,
  clampReceiptAnalysisCleanupLimit,
  resolveReceiptAnalysisBatchStatus,
  shouldScheduleAiReviewNotification,
} from "../../domain/receiptAnalysisJobs/rules";

export async function scheduleAiReviewNotificationIfNeeded(
  deps: { store: ReceiptAnalysisStore; scheduler: ReceiptAnalysisScheduler },
  batchId: string,
  status: string,
  now = Date.now(),
): Promise<void> {
  if (!shouldScheduleAiReviewNotification(status, false)) return;
  const batch = await deps.store.getBatch(batchId);
  if (
    !batch ||
    !shouldScheduleAiReviewNotification(status, Boolean(batch.aiReviewNotificationScheduledAt))
  )
    return;
  await deps.store.patchBatch(batchId, { aiReviewNotificationScheduledAt: now, updatedAt: now });
  await deps.scheduler.scheduleAiReviewCheck(60 * 60 * 1000, batchId);
}

export async function createReceiptAnalysisBatch(
  store: ReceiptAnalysisStore,
  groupId: string,
  userId: string,
  fileNames: string[],
  now = Date.now(),
): Promise<{ batch: ReceiptAnalysisBatchRecord; jobs: ReceiptAnalysisJobRecord[] }> {
  if (fileNames.length === 0) throw new Error("At least one image file is required");
  const batchId = await store.insertBatch({
    groupId,
    createdByUserId: userId,
    totalCount: fileNames.length,
    processedCount: 0,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  const jobs: ReceiptAnalysisJobRecord[] = [];
  for (let imageIndex = 0; imageIndex < fileNames.length; imageIndex++) {
    const jobId = await store.insertJob({
      batchId,
      groupId,
      imageIndex,
      fileName: fileNames[imageIndex],
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    const job = await store.getJob(jobId);
    if (job) jobs.push(job);
  }
  const batch = await store.getBatch(batchId);
  if (!batch) throw new Error("Batch was not found after creation");
  return { batch, jobs };
}

export async function retryReceiptAnalysisJob(
  store: ReceiptAnalysisStore,
  groupId: string,
  jobId: string,
  now = Date.now(),
): Promise<void> {
  const job = await store.getJob(jobId);
  if (!job || job.groupId !== groupId) throw new Error("Job not found");
  if (!canRetryReceiptAnalysisJob(job.status)) {
    throw new Error("Only failed or needs_review jobs can be retried");
  }
  await store.clearJobFields(jobId, { status: "queued", clearError: true, updatedAt: now });
}

export async function cancelReceiptAnalysisJob(
  store: ReceiptAnalysisStore,
  groupId: string,
  jobId: string,
  now = Date.now(),
): Promise<void> {
  const job = await store.getJob(jobId);
  if (!job || job.groupId !== groupId) throw new Error("Job not found");
  if (!canCancelReceiptAnalysisJob(job.status)) {
    throw new Error("Ready jobs must be removed from the draft queue");
  }
  if (job.draftId !== undefined) await store.deleteDraftAndItems(job.draftId, job.groupId);
  await store.clearJobFields(jobId, {
    status: "cancelled",
    clearError: true,
    clearDraftId: true,
    updatedAt: now,
  });
}

export async function updateReceiptAnalysisJobStatus(
  deps: { store: ReceiptAnalysisStore; scheduler: ReceiptAnalysisScheduler },
  args: {
    jobId: string;
    status: "running" | "ready" | "needs_review" | "failed";
    draftId?: string;
    error?: string;
    expectedDraftId?: string | null;
  },
  now = Date.now(),
): Promise<{ applied: boolean }> {
  const job = await deps.store.getJob(args.jobId);
  if (!job) throw new Error("Job not found");
  if (args.expectedDraftId !== undefined && (job.draftId ?? null) !== args.expectedDraftId)
    return { applied: false };
  if (job.status === "cancelled") {
    if (args.draftId !== undefined) await deps.store.deleteDraftAndItems(args.draftId, job.groupId);
    return { applied: false };
  }
  await deps.store.patchJob(args.jobId, {
    status: args.status,
    ...(args.draftId === undefined ? {} : { draftId: args.draftId }),
    ...(args.error === undefined ? {} : { error: args.error }),
    updatedAt: now,
  });
  await scheduleAiReviewNotificationIfNeeded(deps, job.batchId, args.status);
  return { applied: true };
}

export async function finalizeReceiptAnalysisAttempt(
  deps: { store: ReceiptAnalysisStore; scheduler: ReceiptAnalysisScheduler },
  args: {
    jobId: string;
    expectedDraftId: string | null;
    expectedDraftUpdatedAt?: number;
    newDraftId: string;
    status: "ready" | "needs_review" | "failed";
    error?: string;
  },
  now = Date.now(),
): Promise<{ applied: boolean; reason?: "draft_changed" }> {
  const job = await deps.store.getJob(args.jobId);
  if (!job) throw new Error("Job not found");
  const isStale = (job.draftId ?? null) !== args.expectedDraftId;
  if (job.status === "cancelled" || isStale) {
    if (job.draftId !== args.newDraftId)
      await deps.store.deleteDraftAndItems(args.newDraftId, job.groupId);
    return { applied: false };
  }
  if (args.expectedDraftId !== null && args.expectedDraftUpdatedAt !== undefined) {
    const currentDraft = await deps.store.getDraft(args.expectedDraftId);
    if (!currentDraft || currentDraft.updatedAt !== args.expectedDraftUpdatedAt) {
      await deps.store.deleteDraftAndItems(args.newDraftId, job.groupId);
      if (!currentDraft) {
        await deps.store.clearJobFields(args.jobId, {
          status: "cancelled",
          clearDraftId: true,
          clearError: true,
          updatedAt: now,
        });
        return { applied: false, reason: "draft_changed" };
      }
      const restoredStatus: ReceiptAnalysisJobStatus =
        currentDraft.status === "ready" ||
        currentDraft.status === "needs_review" ||
        currentDraft.status === "failed"
          ? currentDraft.status
          : "cancelled";
      await deps.store.clearJobFields(args.jobId, {
        status: restoredStatus,
        ...(restoredStatus === "cancelled"
          ? { clearDraftId: true }
          : { draftId: args.expectedDraftId }),
        clearError: true,
        updatedAt: now,
      });
      await scheduleAiReviewNotificationIfNeeded(deps, job.batchId, restoredStatus);
      return { applied: false, reason: "draft_changed" };
    }
  }
  if (args.status === "failed" && args.expectedDraftId !== null) {
    await deps.store.deleteDraftAndItems(args.newDraftId, job.groupId);
    await deps.store.clearJobFields(args.jobId, {
      status: args.status,
      ...(args.error === undefined ? { clearError: true } : { error: args.error }),
      updatedAt: now,
    });
  } else {
    await deps.store.clearJobFields(args.jobId, {
      status: args.status,
      draftId: args.newDraftId,
      ...(args.error === undefined ? { clearError: true } : { error: args.error }),
      updatedAt: now,
    });
  }
  if (
    args.status !== "failed" &&
    args.expectedDraftId !== null &&
    args.expectedDraftId !== args.newDraftId
  ) {
    await deps.store.deleteDraftAndItems(args.expectedDraftId, job.groupId);
  }
  await scheduleAiReviewNotificationIfNeeded(deps, job.batchId, args.status);
  return { applied: true };
}

export async function incrementReceiptAnalysisBatchProcessedCount(
  store: ReceiptAnalysisStore,
  batchId: string,
  now = Date.now(),
): Promise<void> {
  const batch = await store.getBatch(batchId);
  if (!batch) throw new Error("Batch not found");
  await store.patchBatch(batchId, {
    processedCount: batch.processedCount + 1,
    status: "running",
    updatedAt: now,
  });
}

export async function finalizeReceiptAnalysisBatchStatus(
  store: ReceiptAnalysisStore,
  batchId: string,
  now = Date.now(),
): Promise<void> {
  const batch = await store.getBatch(batchId);
  if (!batch) return;
  const jobs = batch.processedCount < batch.totalCount ? [] : await store.listJobsByBatch(batchId);
  const status = resolveReceiptAnalysisBatchStatus(batch.processedCount, batch.totalCount, jobs);
  if (status) await store.patchBatch(batchId, { status, updatedAt: now });
}

export async function deleteReceiptAnalysisDataByUserBatch(
  store: ReceiptAnalysisStore,
  args: { groupId: string; userId: string; limit?: number },
): Promise<{ deletedBatchCount: number; deletedJobCount: number; hasMore: boolean }> {
  const limit = clampReceiptAnalysisCleanupLimit(args.limit);
  const batches = await store.takeBatchesByGroupAndUser(args.groupId, args.userId, limit);
  let deletedJobCount = 0;
  for (const batch of batches) {
    const jobs = await store.listJobsByBatch(batch.id, 100);
    for (const job of jobs) {
      await store.deleteJob(job.id);
      deletedJobCount += 1;
    }
    await store.deleteBatch(batch.id);
  }
  return { deletedBatchCount: batches.length, deletedJobCount, hasMore: batches.length === limit };
}
