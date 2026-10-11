/**
 * 招待レコード作成ユースケース（internalMutation）。
 * 同一トークンの既存レコード（予約行）は pending のままなら clerkInvitationId を追記し、
 * 後続予約に revoke 済みなら復活させず拒否する。なければ stale 掃除＋招待可否チェックの後に新規作成する。
 */
import type { GroupInvitationRepository } from "../../domain/groups/groupInvitationRepository";
import type { GroupInvitationCleanupService } from "../../domain/groups/groupServices";
import { ConvexError } from "convex/values";
import { MAX_PENDING_GROUP_INVITATIONS } from "../../domain/groups/groupInvitation";
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
    // 2 段階目（Clerk 招待後の clerkInvitationId 追記）。予約行が今も pending のときだけ追記する。
    // 同一メールの後続予約が revokeForEmail でこの行を revoke 済み（または取消済み）なら、
    // pending に戻すと「同一メール pending 1 件」「上限」の不変条件を壊すため復活させない。
    // 予約行が pending のままなら、後続予約は存在せず（存在すれば revoke されている）、
    // 件数にも予約時点で数えられているため、再判定せず clerkInvitationId だけを追記すれば足りる。
    if (existing.status !== "pending") {
      throw new ConvexError(
        "同じメールアドレスへの別の招待操作により、この招待は無効になりました。招待一覧を確認してから再度お試しください",
      );
    }
    await deps.invitations.patch(existing.id, {
      updatedAt: now,
      ...(args.clerkInvitationId ? { clerkInvitationId: args.clerkInvitationId } : {}),
    });
    return existing.id;
  }

  // 形式不正のアドレスは掃除や insert の前に弾く
  const email = normalizeEmailOrThrow(args.email);

  await deps.invitationCleanup.revokeForEmail(args.groupId, email);
  await assertEmailCanBeInvitedToGroup(deps, {
    groupId: args.groupId,
    email,
  });

  // 同一メールの旧 pending は上で revoke 済みなので、再招待は上限に含まれない。
  // 上限判定は上限件数までの bounded read（take）で行い、超過時は Clerk 呼び出しより前に拒否する。
  const pendingInvitations = await deps.invitations.listByGroupAndStatus(
    args.groupId,
    "pending",
    MAX_PENDING_GROUP_INVITATIONS,
  );
  if (pendingInvitations.length >= MAX_PENDING_GROUP_INVITATIONS) {
    throw new ConvexError(
      `未承諾の招待が上限(${MAX_PENDING_GROUP_INVITATIONS}件)に達しています。不要な招待を取り消してから再度お試しください`,
    );
  }

  const invitation = {
    groupId: args.groupId,
    email,
    token: args.token,
    status: "pending" as const,
    invitedByUserId: args.invitedByUserId,
    createdAt: now,
    updatedAt: now,
    ...(args.clerkInvitationId ? { clerkInvitationId: args.clerkInvitationId } : {}),
  };

  return await deps.invitations.insert(invitation);
}
