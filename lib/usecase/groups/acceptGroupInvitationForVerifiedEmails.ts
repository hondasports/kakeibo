/**
 * 検証済みメール群による招待承認ユースケース（internalMutation）。
 * トークン・グループ状態・メール一致を検証し、メンバーシップ作成・
 * activeGroupId 設定・招待 accepted 化・stale 掃除まで一貫して行う。
 */
import { ConvexError } from "convex/values";
import { invitationEmailsMatchAny } from "../../domain/groups/email";
import type { GroupMutationDeps } from "./deps";
import { GROUP_ADMIN_ERROR_MESSAGES } from "./groupAdminErrors";

export async function acceptGroupInvitationForVerifiedEmails(
  deps: Pick<
    GroupMutationDeps,
    "invitations" | "groups" | "accountDeletion" | "memberships" | "users" | "invitationCleanup"
  >,
  args: { token: string; acceptedUserId: string; acceptedEmails: string[] },
): Promise<string> {
  const invite = await deps.invitations.findByToken(args.token);

  if (invite === null || invite.status !== "pending") {
    throw new ConvexError("招待が見つかりません");
  }

  const group = await deps.groups.get(invite.groupId);
  if (
    group === null ||
    group.status === "deleting" ||
    group.status === "deleted" ||
    group.status === "archived"
  ) {
    throw new ConvexError(GROUP_ADMIN_ERROR_MESSAGES.GROUP_DELETING);
  }

  if (!invitationEmailsMatchAny(args.acceptedEmails, invite.email)) {
    throw new ConvexError("招待先メールアドレスと一致しません");
  }
  await deps.accountDeletion.assertNotInProgress(args.acceptedUserId);

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

  const user = await deps.users.findByUserId(args.acceptedUserId);
  if (user !== null) {
    await deps.users.setActiveGroup(user.docId, invite.groupId, now);
  }

  await deps.invitations.patch(invite.id!, {
    status: "accepted",
    acceptedByUserId: args.acceptedUserId,
    acceptedAt: now,
    updatedAt: now,
  });

  await deps.invitationCleanup.revokeForEmail(invite.groupId, invite.email);

  return invite.groupId;
}
