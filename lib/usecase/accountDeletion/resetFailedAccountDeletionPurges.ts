/**
 * 失敗したグループ purge のリセット（internalMutation）。
 * failed 関連を pending へ戻し子ジョブを再開。残っていれば自身を再スケジュールし、
 * なければメイン処理へ進める。
 */
import type { AccountDeletionMutationDeps } from "./deps";

const GROUP_BATCH_SIZE = 25;

export async function resetFailedAccountDeletionPurges(
  deps: Pick<AccountDeletionMutationDeps, "purges" | "scheduler">,
  args: { requestId: string },
): Promise<void> {
  const failedPurges = await deps.purges.takeByRequestAndStatus(
    args.requestId,
    "failed",
    GROUP_BATCH_SIZE,
  );
  for (const purge of failedPurges) {
    await deps.purges.patch(purge.id, {
      status: "pending",
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      updatedAt: Date.now(),
    });
    await deps.scheduler.scheduleResumeGroupDeletion(purge.groupDeletionJobId);
  }
  const remaining = await deps.purges.takeByRequestAndStatus(args.requestId, "failed", 1);
  if (remaining.length > 0) {
    await deps.scheduler.scheduleResetFailedPurges(args.requestId);
  } else {
    await deps.scheduler.scheduleProcess(args.requestId);
  }
}
