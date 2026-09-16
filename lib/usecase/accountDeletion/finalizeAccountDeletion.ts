/**
 * 退会完了処理（internalMutation）。
 * purge 関連→ユーザー紐付きデータ（lineWebhookEvents→lineImageJobs）→完了メール→
 * ユーザー削除→リクエスト completed 化の順で進め、残存があれば自身を再スケジュールする。
 */
import { ConvexError } from "convex/values";
import { isAccountDeletionFinalizableStatus } from "../../domain/accountDeletion/status";
import { ACCOUNT_DELETION_USER_PURGE_TABLES } from "../../domain/accountDeletion/userDataPurgeStore";
import type { AccountDeletionMutationDeps } from "./deps";

const GROUP_BATCH_SIZE = 25;

export async function finalizeAccountDeletion(
  deps: Pick<
    AccountDeletionMutationDeps,
    "requests" | "purges" | "userData" | "users" | "emailQueue" | "scheduler"
  >,
  args: { requestId: string },
): Promise<void> {
  const request = await deps.requests.get(args.requestId);
  if (!request || request.status === "completed") return;
  if (!isAccountDeletionFinalizableStatus(request.status))
    throw new ConvexError("Account deletion is not ready to finalize");

  const purgeRelations = await deps.purges.takeByRequest(args.requestId, GROUP_BATCH_SIZE);
  if (purgeRelations.length > 0) {
    for (const relation of purgeRelations) {
      await deps.purges.delete(relation.id);
    }
    await deps.scheduler.scheduleFinalize(args.requestId);
    return;
  }

  for (const table of ACCOUNT_DELETION_USER_PURGE_TABLES) {
    const ids = await deps.userData.takeUserScopedIds(table, request.userId, GROUP_BATCH_SIZE);
    if (ids.length > 0) {
      for (const id of ids) {
        await deps.userData.deleteDocument(id);
      }
      await deps.scheduler.scheduleFinalize(args.requestId);
      return;
    }
  }

  if (request.recipientEmailSnapshot)
    await deps.emailQueue.enqueue({
      templateType: "account_deletion_completed",
      recipientEmail: request.recipientEmailSnapshot,
      payloadJson: JSON.stringify({
        leftGroupCount: request.leftGroupCount,
        deletedGroupCount: request.deletedGroupCount,
      }),
      businessDedupeKey: `account-deletion-completed/${args.requestId}`,
    });

  const user = await deps.users.findByUserId(request.userId);
  if (user) await deps.users.deleteById(user.docId);
  await deps.requests.patch(args.requestId, {
    status: "completed",
    completedAt: Date.now(),
    updatedAt: Date.now(),
    nextRetryAt: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    recipientEmailSnapshot: undefined,
  });
}
