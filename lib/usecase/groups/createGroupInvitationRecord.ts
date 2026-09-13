/**
 * 招待レコード作成ユースケース（internalMutation）。
 * 同一トークンの既存レコードは pending に戻して再利用し、
 * なければ stale 掃除＋招待可否チェックの後に新規作成する。
 */
import type { GroupInvitationRepository } from "../../domain/groups/groupInvitationRepository";
import type { GroupInvitationCleanupService } from "../../domain/groups/groupServices";
import { normalizeEmailOrThrow } from "./validation";
import { assertEmailCanBeInvitedToGroup } from "./assertEmailCanBeInvitedToGroup";
import type { GroupMembershipReadRepository } from "../../domain/groups/groupMembershipRepository";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";

export async function createGroupInvitationRecord(
  deps: {
    invitations: GroupInvitationRepository;
    memberships: GroupMembershipReadRepository;
    users: UserDirectoryRead;
    invitationCleanup: GroupInvitationCleanupService;
  },
  args: {
    groupId: string;
    email: string;
    token: string;
    invitedByUserId: string;
    clerkInvitationId?: string;
  },
): Promise<string> {
  const now = Date.now();
  const existing = await deps.invitations.findByToken(args.token);

  if (existing) {
    await deps.invitations.patch(existing.id!, {
      status: "pending",
      updatedAt: now,
      ...(args.clerkInvitationId ? { clerkInvitationId: args.clerkInvitationId } : {}),
    });
    return existing.id!;
  }

  await deps.invitationCleanup.revokeForEmail(args.groupId, args.email);
  await assertEmailCanBeInvitedToGroup(deps, {
    groupId: args.groupId,
    email: args.email,
  });

  const invitation = {
    groupId: args.groupId,
    email: normalizeEmailOrThrow(args.email),
    token: args.token,
    status: "pending" as const,
    invitedByUserId: args.invitedByUserId,
    createdAt: now,
    updatedAt: now,
    ...(args.clerkInvitationId ? { clerkInvitationId: args.clerkInvitationId } : {}),
  };

  return await deps.invitations.insert(invitation);
}
