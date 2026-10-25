import type {
  GroupInvitationPreview,
  InvitationRecipient,
} from "../../domain/groups/groupInvitation";
import { ConvexError } from "convex/values";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import { invitationEmailsMatchAny } from "../../domain/groups/email";
import type { GroupInvitationReadRepository } from "../../domain/groups/groupInvitationRepository";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { GroupMembershipReadRepository } from "../../domain/groups/groupMembershipRepository";
import type { GroupInvitationCleanupService } from "../../domain/groups/groupServices";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";
import { GROUP_ADMIN_ERROR_MESSAGES } from "./groupAdminErrors";

type InvitationReadDeps = {
  invitations: GroupInvitationReadRepository;
  groups: GroupReadRepository;
};

export async function requireGroupInvitationForVerifiedEmails(
  deps: InvitationReadDeps,
  args: InvitationRecipient,
) {
  const invite = await deps.invitations.findByToken(args.token);
  if (invite === null || invite.status !== "pending") {
    throw new ConvexError("招待が見つかりません");
  }
  if (!invitationEmailsMatchAny(args.acceptedEmails, invite.email)) {
    throw new ConvexError("招待先メールアドレスと一致しません");
  }
  const group = await deps.groups.get(invite.groupId);
  if (group === null || isGroupDeleted(group)) {
    throw new ConvexError(GROUP_ADMIN_ERROR_MESSAGES.GROUP_DELETING);
  }
  return { invite, group };
}

export async function previewGroupInvitationForVerifiedEmails(
  deps: InvitationReadDeps & {
    invitationEligibility: Pick<GroupInvitationCleanupService, "assertIssuedAfterLastRemoval">;
    users: UserDirectoryRead;
    memberships: GroupMembershipReadRepository;
  },
  args: InvitationRecipient,
): Promise<GroupInvitationPreview> {
  const { invite, group } = await requireGroupInvitationForVerifiedEmails(deps, args);
  await deps.invitationEligibility.assertIssuedAfterLastRemoval(invite.id, args.acceptedUserId);
  const user = await deps.users.findByUserId(args.acceptedUserId);
  const activeGroupId = user?.activeGroupId ?? null;
  const activeMembership = activeGroupId
    ? await deps.memberships.findByGroupAndUser(activeGroupId, args.acceptedUserId)
    : null;
  const activeGroup = activeMembership ? await deps.groups.get(activeMembership.groupId) : null;
  return {
    groupId: invite.groupId,
    groupName: group.name,
    activeGroupId,
    activeGroupName: activeGroup?.name ?? null,
    isExistingMember:
      (await deps.memberships.findByGroupAndUser(invite.groupId, args.acceptedUserId)) !== null,
  };
}
