import type { ReceiptAnalysisActionRunner } from "../../domain/receiptAnalysisJobs/actionRunner";
import {
  canAnalyzeReceiptAnalysisJob,
  ReceiptAnalysisJobDomainError,
} from "../../domain/receiptAnalysisJobs/rules";

export async function analyzeReceiptImageJob(
  runner: ReceiptAnalysisActionRunner,
  args: { jobId: string; imageDataUrl: string },
): Promise<void> {
  await runner.assertConsent();
  const group = await runner.getMyGroup();
  if (!group) throw new ReceiptAnalysisJobDomainError("グループを選択してください");
  const job = await runner.getJob(args.jobId);
  if (job.groupId !== group.id) throw new ReceiptAnalysisJobDomainError("Job not found");
  // 有料解析の前に job の状態を確認する。upload/retry 経路では必ず queued になっており、
  // それ以外の重複・遅延呼び出しは解析せず終了する（クライアントへエラーは返さない）。
  if (!canAnalyzeReceiptAnalysisJob(job.status)) return;
  const startResult = await runner.startAttempt(args.jobId, job.draftId ?? null);
  if (startResult?.applied === false) return;
  await runner.waitForMockExtractor();
  const isRetry = job.draftId !== undefined;
  const preserved =
    isRetry && job.draftId ? await runner.loadPreservedUserOverride(job.draftId, group.id) : null;
  let draft;
  let jobFailed = false;
  try {
    draft = await runner.analyzeImage({
      imageDataUrl: args.imageDataUrl,
      imageFileName: job.fileName,
      telemetryId: args.jobId,
      ...(preserved?.value === undefined ? {} : { preservedUserOverride: preserved.value }),
    });
    if (draft.status === "failed") jobFailed = true;
  } catch (error) {
    jobFailed = true;
    draft = await runner.createFailureDraft(args.jobId, job.fileName, error);
  }
  const finalization = await runner.finalizeAttempt({
    jobId: args.jobId,
    groupId: job.groupId,
    expectedDraftId: job.draftId ?? null,
    ...(preserved === null ? {} : { expectedDraftUpdatedAt: preserved.draftUpdatedAt }),
    newDraftId: draft.id,
    status: jobFailed ? "failed" : draft.status,
    ...(jobFailed ? { error: draft.warnings?.[0] ?? "画像解析に失敗しました" } : {}),
  });
  if (finalization?.applied === false) return;
  if (!isRetry) await runner.incrementBatchProcessedCount(job.batchId);
  await runner.finalizeBatchStatus(job.batchId);
}

export async function checkReceiptAiReviewRequired(
  runner: ReceiptAnalysisActionRunner,
  batchId: string,
): Promise<void> {
  const batch = await runner.getBatch(batchId);
  if (!batch?.createdByUserId) return;
  const pendingCount = await runner.countNeedsReviewJobs(batchId);
  if (pendingCount === 0) return;
  await runner.enqueueAiReviewRequiredNotifications({
    batchId,
    userId: batch.createdByUserId,
    pendingCount,
  });
}
