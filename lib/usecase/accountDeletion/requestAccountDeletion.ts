/**
 * 退会リクエスト開始ユースケース（mutation）。
 * 確認文言・ユーザー存在・進行中ガード・ブロッキンググループ判定を行い、
 * リクエスト作成→孤立membership回収→activeGroup解除→準備バッチをスケジュールする。
 */
import { ConvexError } from "convex/values";
import { isValidAccountDeletionConfirmation } from "../../domain/accountDeletion/confirmation";
import { ACCOUNT_DELETION_GROUP_MEMBERSHIP_INVARIANT_MESSAGE } from "../../domain/accountDeletion/classification";
import type { AccountDeletionMutationDeps } from "./deps";
import {
  assertAccountDeletionNotInProgress,
  deleteOrphanedGroupMemberships,
  loadAccountDeletionClassification,
} from "./classification";

export async function requestAccountDeletion(
  deps: Pick<
    AccountDeletionMutationDeps,
    "requests" | "memberships" | "groups" | "users" | "scheduler"
  >,
  args: {
    confirmationText: string;
    tokenIdentifier: string;
    clerkUserId: string;
  },
): Promise<string> {
  if (!isValidAccountDeletionConfirmation(args.confirmationText)) {
    throw new ConvexError("確認文言が一致しません");
  }
  const user = await deps.users.findByUserId(args.tokenIdentifier);
  if (!user) throw new ConvexError("User not found");
  await assertAccountDeletionNotInProgress(deps, args.tokenIdentifier);
  let loaded: Awaited<ReturnType<typeof loadAccountDeletionClassification>>;
  try {
    loaded = await loadAccountDeletionClassification(deps, args.tokenIdentifier);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== ACCOUNT_DELETION_GROUP_MEMBERSHIP_INVARIANT_MESSAGE
    )
      throw error;
    throw new ConvexError({ code: "GROUP_MEMBERSHIP_INVARIANT" });
  }
  const { classification, orphanMemberships } = loaded;
  if (classification.blockingGroups.length)
    throw new ConvexError({
      code: "ACCOUNT_DELETION_BLOCKED",
      blockingGroups: classification.blockingGroups,
    });
  const now = Date.now();
  const requestId = await deps.requests.insert({
    userId: args.tokenIdentifier,
    clerkUserId: args.clerkUserId,
    ...(user.email ? { recipientEmailSnapshot: user.email } : {}),
    status: "preparing_groups",
    leftGroupCount: classification.groupsToLeave.length,
    deletedGroupCount: classification.groupsToDelete.length,
    attemptCount: 0,
    maxAttempts: 6,
    createdAt: now,
    updatedAt: now,
  });
  await deleteOrphanedGroupMemberships(deps, orphanMemberships);
  await deps.users.setActiveGroup(user.docId, undefined, now);
  await deps.scheduler.schedulePrepareBatch(requestId);
  return requestId;
}
