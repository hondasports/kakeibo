/**
 * メンバー除外ユースケース（オーナーのみ。権限確認は presentation 層で解決済み）。
 * 自己操作禁止・オーナー除外禁止を検証し、除外後の activeGroupId 繰り越し・
 * 招待掃除・監査ログ・通知まで一貫して行う。
 */
import { ConvexError } from "convex/values";
import { getGroupAdminErrorMessage, validateNotSelfOperator } from "../../domain/groups/admin";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
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

  const removedTargetUser = targetUser;
  if (removedTargetUser !== null) {
    // 除外元グループが active だった場合のみ付け替える。他グループを active にしている
    // 対象ユーザーの設定を、別グループのオーナー操作で書き換えさせない。
    if (removedTargetUser.activeGroupId === ctx.groupId) {
      const remainingMemberships = await deps.memberships.listByUser(args.targetUserId);
      let nextActiveGroupId: string | undefined;
      for (const membership of remainingMemberships) {
        if (membership.groupId === ctx.groupId) {
          continue;
        }
        const candidate = await deps.groups.get(membership.groupId);
        // 削除中・削除済みグループは active 候補にしない
        if (candidate !== null && !isGroupDeleted(candidate)) {
          nextActiveGroupId = membership.groupId;
          break;
        }
      }
      await deps.users.setActiveGroup(removedTargetUser.docId, nextActiveGroupId, Date.now());
    }
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
