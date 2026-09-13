/**
 * バッチ失敗時のリトライ記録（内部ステップ）。
 * 既存 groupDeletionBatchRetry.recordRetry の移植 —
 * リトライ計画に従って retry_wait/failed へ遷移し、後続処理をスケジュールする。
 */
import { planGroupDeletionRetry } from "../../domain/groupDeletion/retry";
import type { GroupDeletionJobRecord } from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionMutationDeps } from "./deps";

export async function recordBatchRetry(
  deps: Pick<GroupDeletionMutationDeps, "jobs" | "scheduler">,
  job: GroupDeletionJobRecord,
): Promise<void> {
  const now = Date.now();
  const retryPlan = planGroupDeletionRetry({
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    now,
  });
  if (retryPlan.status === "failed") {
    await deps.jobs.patch(job.id, {
      status: "failed",
      isActive: false,
      attemptCount: retryPlan.attemptCount,
      nextRetryAt: undefined,
      lastErrorCategory: "batch_processing_failed",
      updatedAt: now,
    });
    if (
      job.source === "owner" &&
      job.actorUserIdSnapshot &&
      job.failureNotificationHandledAt === undefined
    ) {
      await deps.scheduler.scheduleFailureNotification(job.id);
    }
    return;
  }

  await deps.jobs.patch(job.id, {
    status: "retry_wait",
    attemptCount: retryPlan.attemptCount,
    nextRetryAt: retryPlan.nextRetryAt,
    lastErrorCategory: "batch_processing_failed",
    updatedAt: now,
  });
  await deps.scheduler.scheduleBatch(job.id, retryPlan.delayMs);
}
