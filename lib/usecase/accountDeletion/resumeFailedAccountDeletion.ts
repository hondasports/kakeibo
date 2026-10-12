/**
 * failed の退会リクエストを再開可能な状態へ戻し、再開地点に応じた後続をスケジュールする共有 helper。
 * ユーザー操作の retryAccountDeletion と、自動復旧の recoverStrandedAccountDeletions が共用する。
 */
import { resolveAccountDeletionResumeStatus } from "../../domain/accountDeletion/resume";
import type { AccountDeletionRequestRecord } from "../../domain/accountDeletion/request";
import type { AccountDeletionMutationDeps } from "./deps";

export async function resumeFailedAccountDeletion(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
  request: AccountDeletionRequestRecord,
): Promise<void> {
  const status = resolveAccountDeletionResumeStatus({
    identityDeletedAt: request.identityDeletedAt,
    preparationCompletedAt: request.preparationCompletedAt,
  });
  await deps.requests.patch(request.id, {
    status,
    attemptCount: 0,
    nextRetryAt: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    updatedAt: Date.now(),
  });
  if (request.identityDeletedAt) {
    await deps.scheduler.scheduleProcess(request.id);
  } else if (request.preparationCompletedAt) {
    await deps.scheduler.scheduleResetFailedPurges(request.id);
  } else {
    await deps.scheduler.schedulePrepareBatch(request.id);
  }
}
