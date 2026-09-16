/**
 * メンバーロール変更ユースケース（オーナーのみ。権限確認は presentation 層で解決済み）。
 * 最後のオーナー降格を防ぐ保護を含む。
 */
import { ConvexError } from "convex/values";
import { getGroupAdminErrorMessage, validateNotSelfOperator } from "../../domain/groups/admin";
import { formatGroupRoleLabel, type GroupRole } from "../../domain/groups/role";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";

export async function changeMemberRole(
  ctx: UsecaseGroupContext,
  deps: Pick<
    GroupMutationDeps,
    "groups" | "memberships" | "users" | "auditLog" | "emailQueue" | "ownerTransition"
  >,
  args: { targetUserId: string; newRole: GroupRole },
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

  const currentRole = targetMembership.role;
  if (currentRole === args.newRole) {
    throw new ConvexError("すでに同じロールです");
  }

  if (currentRole === "owner" && args.newRole === "member") {
    await deps.ownerTransition.assertAnotherOwnerRemains(ctx.groupId, targetMembership.id);
  }

  const now = Date.now();
  await deps.memberships.patch(targetMembership.id, {
    role: args.newRole,
    updatedAt: now,
  });

  const targetUser = await deps.users.findByUserId(args.targetUserId);
  const targetLabel =
    targetUser?.displayName?.trim() || targetUser?.email?.trim() || args.targetUserId;

  await deps.auditLog.record({
    groupId: ctx.groupId,
    actorUserId: ctx.userId,
    action: "member_role_changed",
    targetKind: "member",
    targetId: args.targetUserId,
    targetLabel,
    beforeValue: formatGroupRoleLabel(currentRole),
    afterValue: formatGroupRoleLabel(args.newRole),
  });

  await deps.emailQueue.roleChanged({
    groupName: group.name,
    previousRole: currentRole,
    newRole: args.newRole,
    recipientEmail: targetUser?.email,
  });
}
