/**
 * systemAdminMembershipOperation ユースケース。
 * add/remove/transfer/set_active/clear_active の分岐・監査・通知はベース順序を維持する。
 */
import { ConvexError } from "convex/values";
import {
  getMembershipOperationShapeErrorMessage,
  validateMembershipOperationShape,
  type MembershipOperation,
} from "../../domain/systemAdmin/membershipOperation";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import type { SystemAdminAuditAction } from "../../domain/systemAdmin/auditLog";
import { assertAccountDeletionNotInProgress } from "../accountDeletion/classification";
import type { SystemAdminMutationDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

type MembershipStatus = "none" | "member" | "owner";

type Deps = Pick<
  SystemAdminMutationDeps,
  | "admins"
  | "users"
  | "groups"
  | "memberships"
  | "auditLogs"
  | "notifications"
  | "accountDeletionRequests"
>;

async function requireActiveGroup(deps: Pick<Deps, "groups">, groupId: string) {
  const group = await deps.groups.get(groupId);
  if (!group || (group.status !== undefined && group.status !== "active")) {
    throw new ConvexError("active状態のグループだけを指定できます");
  }
  return group;
}

async function insertMembershipChangeNotifications(
  deps: Pick<Deps, "memberships" | "users" | "notifications">,
  auditId: string,
  targetUserId: string,
  groupIds: Array<string | undefined>,
  operation: MembershipOperation,
  sourceGroupId: string | undefined,
  targetGroupId: string | undefined,
) {
  const recipients = new Set<string>([targetUserId]);
  for (const groupId of new Set(groupIds.filter((id): id is string => !!id))) {
    const owners = await deps.memberships.listByGroupAndRole(groupId, "owner", 101);
    if (owners.length > 100) {
      throw new ConvexError("1グループあたりのowner数が上限を超えています");
    }
    for (const owner of owners) {
      const user = await deps.users.findByUserId(owner.userId);
      if (user) recipients.add(user.docId);
    }
  }

  const payload = JSON.stringify({
    operation,
    targetUserId,
    sourceGroupId: sourceGroupId ?? null,
    targetGroupId: targetGroupId ?? null,
    environment: process.env.APP_ENV ?? "development",
  });
  for (const recipientUserId of recipients) {
    const dedupeKey = `${auditId}:${recipientUserId}`;
    const existing = await deps.notifications.findByDedupeKey(dedupeKey);
    if (existing) continue;
    await deps.notifications.insert({
      action: "system_admin_membership_changed",
      recipientUserId,
      targetUserId,
      dedupeKey,
      payloadJson: payload,
      createdAt: Date.now(),
    });
  }
}

export async function systemAdminMembershipOperation(
  deps: Deps,
  args: {
    tokenIdentifier: string;
    targetUserId: string;
    operation: MembershipOperation;
    sourceGroupId?: string;
    targetGroupId?: string;
    reason: string;
  },
) {
  const { user: actor } = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reasonResult = normalizeSystemAdminReason(args.reason);
  if (!reasonResult.success) {
    throw new ConvexError(getNormalizeReasonErrorMessage(reasonResult.error));
  }
  const reason = reasonResult.reason;
  const shapeResult = validateMembershipOperationShape(
    args.operation,
    args.sourceGroupId,
    args.targetGroupId,
  );
  if (!shapeResult.success) {
    throw new ConvexError(getMembershipOperationShapeErrorMessage(shapeResult.error));
  }

  const targetUser = await deps.users.findByDocId(args.targetUserId);
  if (!targetUser) throw new ConvexError("対象ユーザーが見つかりません");
  await assertAccountDeletionNotInProgress(
    { requests: deps.accountDeletionRequests },
    targetUser.userId,
  );

  const sourceGroup = args.sourceGroupId
    ? await requireActiveGroup(deps, args.sourceGroupId)
    : undefined;
  const targetGroup = args.targetGroupId
    ? await requireActiveGroup(deps, args.targetGroupId)
    : undefined;
  const sourceMembership = sourceGroup
    ? await deps.memberships.findByGroupAndUser(sourceGroup.id, targetUser.userId)
    : null;
  const targetMembership = targetGroup
    ? await deps.memberships.findByGroupAndUser(targetGroup.id, targetUser.userId)
    : null;
  const clearActiveGroup =
    args.operation === "clear_active" && targetUser.activeGroupId
      ? await deps.groups.get(targetUser.activeGroupId)
      : undefined;
  const clearActiveMembership =
    args.operation === "clear_active" && targetUser.activeGroupId
      ? await deps.memberships.findByGroupAndUser(targetUser.activeGroupId, targetUser.userId)
      : null;
  const currentActiveMembership =
    targetUser.activeGroupId && args.operation !== "clear_active"
      ? await deps.memberships.findByGroupAndUser(targetUser.activeGroupId, targetUser.userId)
      : null;
  if (
    targetUser.activeGroupId &&
    args.operation !== "clear_active" &&
    args.operation !== "set_active" &&
    !currentActiveMembership
  ) {
    throw new ConvexError("activeグループの所属が見つからないため操作できません");
  }
  const beforeActiveGroupId = targetUser.activeGroupId;
  let afterActiveGroupId = beforeActiveGroupId;
  let beforeMembershipStatus: MembershipStatus = "none";
  let afterMembershipStatus: MembershipStatus = "none";
  let action: SystemAdminAuditAction;
  let notificationGroupIds: Array<string | undefined> = [];

  switch (args.operation) {
    case "add":
      if (targetMembership) throw new ConvexError("このユーザーはすでにグループに所属しています");
      await deps.memberships.insert({
        groupId: targetGroup!.id,
        userId: targetUser.userId,
        role: "member",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      beforeMembershipStatus = "none";
      afterMembershipStatus = "member";
      action = "system_admin_membership_added";
      notificationGroupIds = [targetGroup!.id];
      break;
    case "remove":
      if (!sourceMembership) throw new ConvexError("指定されたメンバーが見つかりません");
      if (sourceMembership.role === "owner") {
        throw new ConvexError("ownerの所属解除はこの操作ではできません");
      }
      await deps.memberships.delete(sourceMembership.id);
      if (targetUser.activeGroupId === sourceGroup!.id) afterActiveGroupId = undefined;
      beforeMembershipStatus = "member";
      afterMembershipStatus = "none";
      action = "system_admin_membership_removed";
      notificationGroupIds = [sourceGroup!.id];
      break;
    case "transfer":
      if (!sourceMembership) throw new ConvexError("移動元グループの所属が見つかりません");
      if (sourceMembership.role === "owner") {
        throw new ConvexError("ownerの付替えはこの操作ではできません");
      }
      if (targetMembership) throw new ConvexError("移動先グループにすでに所属しています");
      await deps.memberships.delete(sourceMembership.id);
      await deps.memberships.insert({
        groupId: targetGroup!.id,
        userId: targetUser.userId,
        role: "member",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      if (targetUser.activeGroupId === sourceGroup!.id) afterActiveGroupId = targetGroup!.id;
      beforeMembershipStatus = "member";
      afterMembershipStatus = "member";
      action = "system_admin_membership_transferred";
      notificationGroupIds = [sourceGroup!.id, targetGroup!.id];
      break;
    case "set_active":
      if (!targetMembership) throw new ConvexError("activeグループに指定する所属がありません");
      if (targetUser.activeGroupId === targetGroup!.id) {
        throw new ConvexError("すでにactiveグループに設定されています");
      }
      afterActiveGroupId = targetGroup!.id;
      beforeMembershipStatus = targetMembership.role;
      afterMembershipStatus = targetMembership.role;
      action = "system_admin_active_group_set";
      notificationGroupIds = [targetGroup!.id];
      break;
    case "clear_active":
      if (!targetUser.activeGroupId) throw new ConvexError("activeグループは未選択です");
      afterActiveGroupId = undefined;
      beforeMembershipStatus = clearActiveMembership?.role ?? "none";
      afterMembershipStatus = beforeMembershipStatus;
      action = "system_admin_active_group_cleared";
      notificationGroupIds = [targetUser.activeGroupId];
      break;
  }

  if (args.operation === "set_active" || args.operation === "clear_active") {
    await deps.users.setActiveGroup(targetUser.docId, afterActiveGroupId, Date.now());
  } else if (afterActiveGroupId !== beforeActiveGroupId) {
    await deps.users.setActiveGroup(targetUser.docId, afterActiveGroupId, Date.now());
  }

  const auditId = await deps.auditLogs.insert({
    action,
    actorType: "system_admin",
    actorUserId: actor.docId,
    targetKind: "user",
    targetUserId: targetUser.docId,
    targetDisplayNameSnapshot:
      targetUser.displayName?.trim() || targetUser.email || targetUser.userId,
    sourceGroupId: sourceGroup?.id ?? clearActiveGroup?.id,
    sourceGroupNameSnapshot: sourceGroup?.name ?? clearActiveGroup?.name,
    targetGroupId: targetGroup?.id,
    targetGroupNameSnapshot: targetGroup?.name,
    beforeMembershipStatus,
    afterMembershipStatus,
    beforeActiveGroupId,
    afterActiveGroupId,
    reason,
    result: "success",
    createdAt: Date.now(),
  });
  await insertMembershipChangeNotifications(
    deps,
    auditId,
    targetUser.docId,
    notificationGroupIds,
    args.operation,
    sourceGroup?.id ?? clearActiveGroup?.id,
    targetGroup?.id,
  );
  return { operation: args.operation, status: "success" as const };
}
