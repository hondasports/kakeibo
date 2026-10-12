/**
 * 退会リトライユースケース（mutation）。
 * failed リクエストを resume 可能な状態へ戻し、再開地点に応じた後続をスケジュールする。
 */
import { ConvexError } from "convex/values";
import { resumeFailedAccountDeletion } from "./resumeFailedAccountDeletion";
import type { AccountDeletionMutationDeps } from "./deps";

const DEFAULT_BATCH_LIMIT = 25;

export async function retryAccountDeletion(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
  args: { userId: string },
): Promise<null> {
  const requests = await deps.requests.listByUser(args.userId, DEFAULT_BATCH_LIMIT);
  const request = requests.find((item) => item.status === "failed");
  if (!request) throw new ConvexError("再試行できる退会処理がありません");
  await resumeFailedAccountDeletion(deps, request);
  return null;
}
