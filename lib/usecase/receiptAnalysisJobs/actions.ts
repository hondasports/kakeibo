import type { ReceiptAnalysisActionRunner } from "../../domain/receiptAnalysisJobs/actionRunner";
import { RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR } from "../../domain/receiptAnalysisJobs/dailyUsage";
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
  const isRetry = job.draftId !== undefined;
  const preserved =
    isRetry && job.draftId ? await runner.loadPreservedUserOverride(job.draftId, group.id) : null;
  const startResult = await runner.startAttempt(args.jobId, job.draftId ?? null);
  if (startResult?.applied === false) {
    // 日次上限による終端は mutation 側で job を確定済み。ここで throw しても rollback せず、
    // retry 経路では既存のエラー表示に翌日の案内が届く。upload 経路では個別の action エラーは
    // 表示しない設計なので、失敗下書きのヒント（既存の表示モデル）が案内を担う。
    if (startResult?.denialReason === "daily_limit") {
      throw new ReceiptAnalysisJobDomainError(RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR);
    }
    return;
  }
  await runner.waitForMockExtractor();
  let draft;
  let jobFailed = false;
  try {
    draft = await runner.analyzeImage({
      groupId: job.groupId,
      imageDataUrl: args.imageDataUrl,
      imageFileName: job.fileName,
      telemetryId: args.jobId,
      ...(preserved?.value === undefined ? {} : { preservedUserOverride: preserved.value }),
    });
    if (draft.status === "failed") jobFailed = true;
  } catch (error) {
    jobFailed = true;
    draft = await runner.createFailureDraft(args.jobId, job.fileName, error, job.groupId);
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
  // 終端確定ごとに batch の進捗を job の実状態から再計算する。増分計上ではないので
  // 再試行の重複計上も、停止回復を経た再試行の未計上も起きない。
  await runner.recomputeBatchProgress(job.batchId);
}

export async function checkReceiptAiReviewRequired(
  runner: ReceiptAnalysisActionRunner,
  batchId: string,
): Promise<void> {
  const batch = await runner.getBatch(batchId);
  if (!batch?.createdByUserId) return;
  // 確認待ちの下書きの数は、通知を積む mutation の中で数える。ここで数えて渡すと、
  // 数えた後・積む前に利用者が下書きを確認したときに、古い件数で通知してしまう。
  await runner.enqueueAiReviewRequiredNotifications({
    batchId,
    userId: batch.createdByUserId,
  });
}
