import { ConvexError, v } from "convex/values";
import { RECEIPT_ANALYSIS_JOB_STATUSES } from "../../lib/domain/receiptAnalysisJobs/records";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  getReceiptAnalysisBatchDocument,
  getReceiptAnalysisJobDocument,
} from "../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore";
import {
  createReceiptAnalysisMutationDeps,
  createReceiptAnalysisQueryDeps,
} from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import { ReceiptAnalysisJobDomainError } from "../../lib/domain/receiptAnalysisJobs/rules";
import {
  deleteReceiptAnalysisDataByUserBatch as deleteUserDataBatch,
  finalizeReceiptAnalysisAttempt,
  finalizeReceiptAnalysisBatchStatus,
  incrementReceiptAnalysisBatchProcessedCount,
  recoverStaleReceiptAnalysisJobs as recoverStaleJobs,
  scheduleAiReviewNotificationIfNeeded as scheduleNotification,
  updateReceiptAnalysisJobStatus,
} from "../../lib/usecase/receiptAnalysisJobs/operations";

export { isTerminalImageJobStatus } from "../../lib/domain/receiptAnalysisJobs/status";

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  // ドメインエラーだけを endpoint 契約の ConvexError へ変換する。
  // DB・アダプタ由来の予期しないエラーはそのまま再送出し、メッセージを露出させない。
  if (error instanceof ReceiptAnalysisJobDomainError) throw new ConvexError(error.message);
  throw error;
}

export async function getBatchByIdHandler(
  ctx: QueryCtx,
  { batchId }: { batchId: Id<"receiptAnalysisBatches"> },
) {
  return await getReceiptAnalysisBatchDocument(ctx, batchId);
}

export async function countNeedsReviewJobsByBatchIdHandler(
  ctx: QueryCtx,
  { batchId }: { batchId: Id<"receiptAnalysisBatches"> },
): Promise<number> {
  return createReceiptAnalysisQueryDeps(ctx).reader.countJobsByStatus(batchId, "needs_review");
}

export async function scheduleAiReviewNotificationIfNeeded(
  ctx: MutationCtx,
  { batchId, status }: { batchId: Id<"receiptAnalysisBatches">; status: string },
) {
  await scheduleNotification(createReceiptAnalysisMutationDeps(ctx), batchId, status);
}

export async function updateJobStatusHandler(
  ctx: MutationCtx,
  args: {
    jobId: Id<"receiptAnalysisImageJobs">;
    status: "running" | "ready" | "needs_review" | "failed";
    draftId?: Id<"aiExpenseDrafts">;
    error?: string;
    expectedDraftId?: Id<"aiExpenseDrafts"> | null;
  },
) {
  try {
    return await updateReceiptAnalysisJobStatus(createReceiptAnalysisMutationDeps(ctx), args);
  } catch (error) {
    convexError(error);
  }
}

export async function finalizeAnalysisAttemptHandler(
  ctx: MutationCtx,
  args: {
    jobId: Id<"receiptAnalysisImageJobs">;
    groupId?: Id<"groups">;
    expectedDraftId: Id<"aiExpenseDrafts"> | null;
    expectedDraftUpdatedAt?: number;
    newDraftId: Id<"aiExpenseDrafts">;
    status: "ready" | "needs_review" | "failed";
    error?: string;
  },
) {
  try {
    return await finalizeReceiptAnalysisAttempt(createReceiptAnalysisMutationDeps(ctx), args);
  } catch (error) {
    convexError(error);
  }
}

export async function incrementBatchProcessedCountHandler(
  ctx: MutationCtx,
  args: { batchId: Id<"receiptAnalysisBatches"> },
) {
  try {
    await incrementReceiptAnalysisBatchProcessedCount(
      createReceiptAnalysisMutationDeps(ctx).store,
      args.batchId,
    );
  } catch (error) {
    convexError(error);
  }
}

export async function finalizeBatchStatusHandler(
  ctx: MutationCtx,
  args: { batchId: Id<"receiptAnalysisBatches"> },
) {
  await finalizeReceiptAnalysisBatchStatus(
    createReceiptAnalysisMutationDeps(ctx).store,
    args.batchId,
  );
}

export async function getJobByIdHandler(
  ctx: QueryCtx,
  { jobId }: { jobId: Id<"receiptAnalysisImageJobs"> },
) {
  const job = await getReceiptAnalysisJobDocument(ctx, jobId);
  if (!job) throw new ConvexError("Job not found");
  return job;
}

export async function deleteReceiptAnalysisDataByUserBatchHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; userId: string; limit?: number },
) {
  return deleteUserDataBatch(createReceiptAnalysisMutationDeps(ctx).store, args);
}

export async function recoverStaleReceiptAnalysisJobsHandler(ctx: MutationCtx) {
  return await recoverStaleJobs(createReceiptAnalysisMutationDeps(ctx));
}

const jobStatusValidator = v.union(
  ...RECEIPT_ANALYSIS_JOB_STATUSES.map((status) => v.literal(status)),
);

export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("receiptAnalysisImageJobs"),
    status: jobStatusValidator,
    draftId: v.optional(v.id("aiExpenseDrafts")),
    error: v.optional(v.string()),
    expectedDraftId: v.optional(v.union(v.id("aiExpenseDrafts"), v.null())),
  },
  handler: updateJobStatusHandler,
});

export const finalizeAnalysisAttempt = internalMutation({
  args: {
    jobId: v.id("receiptAnalysisImageJobs"),
    groupId: v.optional(v.id("groups")),
    expectedDraftId: v.union(v.id("aiExpenseDrafts"), v.null()),
    expectedDraftUpdatedAt: v.optional(v.number()),
    newDraftId: v.id("aiExpenseDrafts"),
    status: v.union(v.literal("ready"), v.literal("needs_review"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: finalizeAnalysisAttemptHandler,
});

export const incrementBatchProcessedCount = internalMutation({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: incrementBatchProcessedCountHandler,
});

export const finalizeBatchStatus = internalMutation({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: finalizeBatchStatusHandler,
});

export const getBatchById = internalQuery({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: getBatchByIdHandler,
});

export const countNeedsReviewJobsByBatchId = internalQuery({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: countNeedsReviewJobsByBatchIdHandler,
});

export const getJobById = internalQuery({
  args: { jobId: v.id("receiptAnalysisImageJobs") },
  handler: getJobByIdHandler,
});

export const deleteReceiptAnalysisDataByUserBatch = internalMutation({
  args: {
    groupId: v.id("groups"),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: deleteReceiptAnalysisDataByUserBatchHandler,
});

export const recoverStaleReceiptAnalysisJobs = internalMutation({
  args: {},
  handler: recoverStaleReceiptAnalysisJobsHandler,
});
