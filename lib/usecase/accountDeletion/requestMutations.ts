/**
 * リクエスト状態更新の小粒ユースケース群（internalMutation 群）。
 * mark 系・scheduleRetry・cleanupCompletedRequests の移植。
 */
import { getAccountDeletionRetryDelay } from "../../domain/accountDeletion/retry";
import type { AccountDeletionRequestRecord } from "../../domain/accountDeletion/request";
import type { AccountDeletionMutationDeps } from "./deps";

export async function markDeletingIdentity(
  deps: Pick<AccountDeletionMutationDeps, "requests">,
  args: { requestId: string },
): Promise<AccountDeletionRequestRecord | null> {
  const request = await deps.requests.get(args.requestId);
  if (!request || request.status === "completed") return null;
  await deps.requests.patch(args.requestId, {
    status: "deleting_identity",
    updatedAt: Date.now(),
  });
  return request;
}

export async function markIdentityDeleted(
  deps: Pick<AccountDeletionMutationDeps, "requests">,
  args: { requestId: string },
): Promise<AccountDeletionRequestRecord | null> {
  const request = await deps.requests.get(args.requestId);
  if (!request || request.status === "completed") return null;
  await deps.requests.patch(args.requestId, {
    status: "identity_deleted",
    identityDeletedAt: Date.now(),
    attemptCount: 0,
    nextRetryAt: undefined,
    updatedAt: Date.now(),
  });
  return request;
}

export async function scheduleAccountDeletionRetry(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
  args: { requestId: string; code: string; message: string; finalization: boolean },
): Promise<void> {
  const request = await deps.requests.get(args.requestId);
  if (!request || request.status === "completed") return;
  const nextAttempt = request.attemptCount + 1;
  if (nextAttempt >= request.maxAttempts) {
    await deps.requests.patch(args.requestId, {
      status: "failed",
      attemptCount: nextAttempt,
      nextRetryAt: undefined,
      lastErrorCode: args.code,
      lastErrorMessage: args.message,
      updatedAt: Date.now(),
    });
    return;
  }
  const delay = getAccountDeletionRetryDelay(nextAttempt - 1);
  const now = Date.now();
  await deps.requests.patch(args.requestId, {
    status: args.finalization ? "finalization_retry_wait" : "retry_wait",
    attemptCount: nextAttempt,
    nextRetryAt: now + delay,
    lastErrorCode: args.code,
    lastErrorMessage: args.message,
    updatedAt: now,
  });
  await deps.scheduler.scheduleProcess(args.requestId, delay);
}

const CLEANUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;

export async function cleanupCompletedAccountDeletionRequests(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
): Promise<void> {
  const cutoff = Date.now() - CLEANUP_RETENTION_MS;
  const requests = await deps.requests.listCompletedBefore(cutoff, CLEANUP_BATCH_SIZE);
  for (const request of requests) {
    await deps.requests.delete(request.id);
  }
  if (requests.length === CLEANUP_BATCH_SIZE) {
    await deps.scheduler.scheduleCleanup();
  }
}
