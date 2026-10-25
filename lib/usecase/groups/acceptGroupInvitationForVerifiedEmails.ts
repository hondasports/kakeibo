/**
 * 検証済みメール群による招待承認ユースケース（internalMutation）。
 * トークン・グループ状態・メール一致を検証し、メンバーシップ作成・
 * activeGroupId 設定・招待 accepted 化・stale 掃除まで一貫して行う。
 */
import type {
  InvitationAcceptanceConsent,
  InvitationRecipient,
} from "../../domain/groups/groupInvitation";
import { ConvexError } from "convex/values";
import { requireGroupInvitationForVerifiedEmails } from "./previewGroupInvitationForVerifiedEmails";
import type { GroupMutationDeps } from "./deps";

export async function acceptGroupInvitationForVerifiedEmails(
  deps: Pick<
    GroupMutationDeps,
    "invitations" | "groups" | "accountDeletion" | "memberships" | "users" | "invitationCleanup"
  >,
  args: InvitationRecipient & InvitationAcceptanceConsent,
): Promise<string> {
  const { invite } = await requireGroupInvitationForVerifiedEmails(deps, args);
  await deps.invitationCleanup.assertIssuedAfterLastRemoval(invite.id, args.acceptedUserId);
  await deps.accountDeletion.assertNotInProgress(args.acceptedUserId);
  const user = await deps.users.findByUserId(args.acceptedUserId);
  if (
    args.expectedActiveGroupId !== undefined &&
    user?.activeGroupId !== args.expectedActiveGroupId
  ) {
    throw new ConvexError("表示するグループが変わりました。招待内容を再確認してください");
  }
  if (user?.activeGroupId && user.activeGroupId !== invite.groupId) {
    if (!args.switchActiveGroup || args.expectedActiveGroupId !== user.activeGroupId) {
      throw new ConvexError("表示するグループの切り替えを確認してください");
    }
  }

  const existingMembership = await deps.memberships.findByGroupAndUser(
    invite.groupId,
    args.acceptedUserId,
  );

  const now = Date.now();
  if (existingMembership === null) {
    await deps.memberships.insert({
      groupId: invite.groupId,
      userId: args.acceptedUserId,
      role: "member",
      createdAt: now,
      updatedAt: now,
    });
  }

  if (user !== null) {
    await deps.users.setActiveGroup(user.docId, invite.groupId, now);
  }

  await deps.invitations.patch(invite.id, {
    status: "accepted",
    acceptedByUserId: args.acceptedUserId,
    acceptedAt: now,
    updatedAt: now,
  });

  await deps.invitationCleanup.revokeForEmail(invite.groupId, invite.email);

  return invite.groupId;
}
