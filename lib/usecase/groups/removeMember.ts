/**
 * メンバー除外ユースケース（オーナーのみ。権限確認は presentation 層で解決済み）。
 * 自己操作禁止・オーナー除外禁止を検証し、除外後の activeGroupId 繰り越し・
 * 招待掃除・監査ログ・通知まで一貫して行う。
 */
import { ConvexError } from "convex/values";
import { getGroupAdminErrorMessage, validateNotSelfOperator } from "../../domain/groups/admin";
import { validateRemovableGroupMemberRole } from "../../domain/groups/admin";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";

export async function removeMember(
  ctx: UsecaseGroupContext,
  deps: Pick<
    GroupMutationDeps,
    "groups" | "memberships" | "users" | "invitationCleanup" | "auditLog" | "emailQueue"
  >,
  args: { targetUserId: string },
): Promise<void> {
  const selfCheck = validateNotSelfOperator(ctx.userId, args.targetUserId);
  if (!selfCheck.success) {
    throw new ConvexError(getGroupAdminErrorMessage(selfCheck.error));
  }

  const group = await deps.groups.get(ctx.groupId);
  if (group === null) {
    throw new ConvexError("グループが見つかりません");
  }

  const targetMembership = await deps.memberships.findByGroupAndUser(
    ctx.groupId,
    args.targetUserId,
  );

  if (targetMembership === null) {
    throw new ConvexError("指定されたメンバーが見つかりません");
  }

  const roleCheck = validateRemovableGroupMemberRole(targetMembership.role);
  if (!roleCheck.success) {
    throw new ConvexError(getGroupAdminErrorMessage(roleCheck.error));
  }

  const targetUser = await deps.users.findByUserId(args.targetUserId);
  const targetLabel =
    targetUser?.displayName?.trim() || targetUser?.email?.trim() || args.targetUserId;
  const groupName = group.name;

  await deps.memberships.delete(targetMembership.id);

  const remainingMemberships = await deps.memberships.listByUser(args.targetUserId);
  const removedTargetUser = targetUser;
  if (removedTargetUser !== null) {
    const nextActiveGroupId = remainingMemberships[0]?.groupId ?? undefined;
    await deps.users.setActiveGroup(removedTargetUser.docId, nextActiveGroupId, Date.now());
    if (removedTargetUser.email) {
      await deps.invitationCleanup.revokeForEmail(ctx.groupId, removedTargetUser.email);
    }
  }

  await deps.auditLog.record({
    groupId: ctx.groupId,
    actorUserId: ctx.userId,
    action: "member_removed",
    targetKind: "member",
    targetId: args.targetUserId,
    targetLabel,
  });

  await deps.emailQueue.membershipRemoved({
    groupName,
    recipientEmail: targetUser?.email,
  });
}
