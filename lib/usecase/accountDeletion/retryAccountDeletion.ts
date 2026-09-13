/**
 * 退会リトライユースケース（mutation）。
 * failed リクエストを resume 可能な状態へ戻し、再開地点に応じた後続をスケジュールする。
 */
import { ConvexError } from "convex/values";
import { resolveAccountDeletionResumeStatus } from "../../domain/accountDeletion/resume";
import type { AccountDeletionMutationDeps } from "./deps";

const DEFAULT_BATCH_LIMIT = 25;

export async function retryAccountDeletion(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
  args: { userId: string },
): Promise<null> {
  const requests = await deps.requests.listByUser(args.userId, DEFAULT_BATCH_LIMIT);
  const request = requests.find((item) => item.status === "failed");
  if (!request) throw new ConvexError("再試行できる退会処理がありません");
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
  return null;
}
