/**
 * 招待可否チェックユースケース（internalQuery）。
 * 所属チェックと承認済み（まだ所属中）チェックを行う。pending の無効化は呼び出し前に revoke すること。
 */
import { ConvexError } from "convex/values";
import { invitationEmailsMatch } from "../../domain/groups/email";
import type { GroupInvitationReadRepository } from "../../domain/groups/groupInvitationRepository";
import type { GroupMembershipReadRepository } from "../../domain/groups/groupMembershipRepository";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";
import { normalizeEmailOrThrow } from "./validation";

export async function assertEmailCanBeInvitedToGroup(
  deps: {
    memberships: GroupMembershipReadRepository;
    users: UserDirectoryRead;
    invitations: GroupInvitationReadRepository;
  },
  args: { groupId: string; email: string },
): Promise<null> {
  const email = normalizeEmailOrThrow(args.email);
  const members = await deps.memberships.listByGroup(args.groupId);

  for (const member of members) {
    const user = await deps.users.findByUserId(member.userId);
    if (user?.email && invitationEmailsMatch(user.email, email)) {
      throw new ConvexError("このユーザーはすでにグループに参加しています");
    }
  }

  const acceptedInvitations = await deps.invitations.listByGroupAndStatus(args.groupId, "accepted");
  for (const invitation of acceptedInvitations) {
    if (!invitationEmailsMatch(invitation.email, email) || !invitation.acceptedByUserId) {
      continue;
    }

    const membership = await deps.memberships.findByGroupAndUser(
      args.groupId,
      invitation.acceptedByUserId,
    );
    if (membership !== null) {
      throw new ConvexError("このメールアドレスの招待はすでに承認済みです");
    }
  }

  return null;
}
