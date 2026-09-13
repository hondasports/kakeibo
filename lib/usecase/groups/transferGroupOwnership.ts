/**
 * オーナー権限譲渡ユースケース（オーナーのみ。権限確認は presentation 層で解決済み）。
 * 最後の owner 不在を避けるため、先に譲渡先を owner に昇格してから譲渡元を member に降格する。
 */
import { ConvexError } from "convex/values";
import { getGroupAdminErrorMessage, validateNotSelfOperator } from "../../domain/groups/admin";
import { formatGroupRoleLabel } from "../../domain/groups/role";
import { GROUP_ADMIN_ERROR_MESSAGES } from "./groupAdminErrors";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";

export async function transferGroupOwnership(
  ctx: UsecaseGroupContext & { membershipId: string },
  deps: Pick<GroupMutationDeps, "groups" | "memberships" | "users" | "auditLog" | "emailQueue">,
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

  if (targetMembership.role !== "member") {
    throw new ConvexError(GROUP_ADMIN_ERROR_MESSAGES.TRANSFER_TARGET_MUST_BE_MEMBER);
  }

  const actorUser = await deps.users.findByUserId(ctx.userId);
  const targetUser = await deps.users.findByUserId(args.targetUserId);
  const actorLabel = actorUser?.displayName?.trim() || actorUser?.email?.trim() || ctx.userId;
  const targetLabel =
    targetUser?.displayName?.trim() || targetUser?.email?.trim() || args.targetUserId;

  const now = Date.now();
  await deps.memberships.patch(targetMembership.id!, {
    role: "owner",
    updatedAt: now,
  });
  await deps.memberships.patch(ctx.membershipId, {
    role: "member",
    updatedAt: now,
  });

  await deps.auditLog.record({
    groupId: ctx.groupId,
    actorUserId: ctx.userId,
    action: "owner_transferred",
    targetKind: "member",
    targetId: args.targetUserId,
    targetLabel,
    beforeValue: `オーナー: ${actorLabel}`,
    afterValue: `オーナー: ${targetLabel}（${actorLabel} → ${formatGroupRoleLabel("member")}）`,
  });

  const newOwnerDisplayName =
    targetUser?.displayName?.trim() || targetUser?.email?.trim() || args.targetUserId;

  await Promise.all([
    deps.emailQueue.ownershipReceived({
      groupName: group.name,
      recipientEmail: targetUser?.email,
    }),
    deps.emailQueue.ownershipTransferred({
      groupName: group.name,
      newOwnerDisplayName,
      recipientEmail: actorUser?.email,
    }),
  ]);
}
