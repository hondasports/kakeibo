/**
 * systemAdminRoleOperation ユースケース（change_role / transfer_owner）。
 */
import { ConvexError } from "convex/values";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import { assertAccountDeletionNotInProgress } from "../accountDeletion/classification";
import type { SystemAdminMutationDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

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

async function notify(
  deps: Pick<Deps, "memberships" | "users" | "admins" | "notifications">,
  auditId: string,
  targetUserId: string,
  groupId: string,
  operation: string,
  extraRecipientUserId?: string,
) {
  const recipients = new Set<string>([targetUserId]);
  if (extraRecipientUserId) recipients.add(extraRecipientUserId);
  const owners = await deps.memberships.listByGroupAndRole(groupId, "owner", 101);
  if (owners.length > 100) throw new ConvexError("owner数が上限を超えています");
  for (const owner of owners) {
    const user = await deps.users.findByUserId(owner.userId);
    if (user) recipients.add(user.docId);
  }
  const admins = await deps.admins.takeByStatus("active", 101);
  if (admins.length > 100) throw new ConvexError("active system admin数が上限を超えています");
  for (const admin of admins) recipients.add(admin.userId);
  for (const recipientUserId of recipients) {
    const dedupeKey = `${auditId}:${recipientUserId}`;
    const existing = await deps.notifications.findByDedupeKey(dedupeKey);
    if (existing) continue;
    await deps.notifications.insert({
      action: "system_admin_membership_changed",
      recipientUserId,
      targetUserId,
      dedupeKey,
      payloadJson: JSON.stringify({
        operation,
        groupId,
        targetUserId,
        environment: process.env.APP_ENV ?? "development",
      }),
      createdAt: Date.now(),
    });
  }
}

export async function systemAdminRoleOperation(
  deps: Deps,
  args: {
    tokenIdentifier: string;
    operation: "change_role" | "transfer_owner";
    groupId: string;
    targetUserId: string;
    sourceOwnerUserId?: string;
    newRole?: "owner" | "member";
    reason: string;
  },
): Promise<null> {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reasonResult = normalizeSystemAdminReason(args.reason);
  if (!reasonResult.success)
    throw new ConvexError(getNormalizeReasonErrorMessage(reasonResult.error));
  const reason = reasonResult.reason;
  const group = await deps.groups.get(args.groupId);
  if (!group || group.status !== "active")
    throw new ConvexError("active状態のグループだけを指定できます");
  const target = await deps.users.findByDocId(args.targetUserId);
  if (!target) throw new ConvexError("対象ユーザーが存在しません");
  const targetMembership = await deps.memberships.findByGroupAndUser(args.groupId, target.userId);
  if (!targetMembership) throw new ConvexError("対象ユーザーはこのgroupのmemberではありません");
  await assertAccountDeletionNotInProgress(
    { requests: deps.accountDeletionRequests },
    target.userId,
  );
  const owners = await deps.memberships.listByGroupAndRole(args.groupId, "owner", 101);
  if (owners.length > 100) throw new ConvexError("owner数が上限を超えています");
  let action: "system_admin_group_role_changed" | "system_admin_group_owner_transferred";
  let sourceUser: typeof target | undefined;
  let beforeRole = targetMembership.role;
  let afterRole = targetMembership.role;
  if (args.operation === "change_role") {
    if (!args.newRole || args.sourceOwnerUserId) throw new ConvexError("role変更の指定が不正です");
    if (args.newRole === targetMembership.role) throw new ConvexError("すでに同じroleです");
    if (args.newRole === "owner" && owners.length === 0)
      throw new ConvexError("owner不在groupは専用の復旧フローを使ってください");
    if (args.newRole === "member" && owners.length <= 1)
      throw new ConvexError("最後のownerはmemberへ変更できません");
    afterRole = args.newRole;
    action = "system_admin_group_role_changed";
  } else {
    if (args.newRole || !args.sourceOwnerUserId || args.sourceOwnerUserId === args.targetUserId)
      throw new ConvexError("owner付替えの指定が不正です");
    const source = await deps.users.findByDocId(args.sourceOwnerUserId);
    if (!source) throw new ConvexError("付替え元ユーザーが存在しません");
    sourceUser = source;
    await assertAccountDeletionNotInProgress(
      { requests: deps.accountDeletionRequests },
      source.userId,
    );
    const sourceMembership = await deps.memberships.findByGroupAndUser(args.groupId, source.userId);
    if (!sourceMembership || sourceMembership.role !== "owner")
      throw new ConvexError("付替え元はownerではありません");
    if (targetMembership.role !== "member")
      throw new ConvexError("付替え先はmemberである必要があります");
    afterRole = "owner";
    await deps.memberships.patch(targetMembership.id, { role: "owner", updatedAt: Date.now() });
    await deps.memberships.patch(sourceMembership.id, { role: "member", updatedAt: Date.now() });
    action = "system_admin_group_owner_transferred";
  }
  if (args.operation === "change_role")
    await deps.memberships.patch(targetMembership.id, { role: afterRole, updatedAt: Date.now() });
  const auditId = await deps.auditLogs.insert({
    action,
    actorType: "system_admin",
    actorUserId: actor.user.docId,
    targetKind: "group",
    targetUserId: target.docId,
    targetId: args.groupId,
    targetDisplayNameSnapshot: target.displayName,
    sourceUserId: sourceUser?.docId,
    sourceUserDisplayNameSnapshot: sourceUser?.displayName,
    reason,
    beforeMembershipStatus: beforeRole,
    afterMembershipStatus: afterRole,
    beforeOwnerCount: owners.length,
    afterOwnerCount:
      args.operation === "change_role" && afterRole === "member"
        ? owners.length - 1
        : args.operation === "change_role"
          ? owners.length + 1
          : owners.length,
    sourceGroupId: args.groupId,
    sourceGroupNameSnapshot: group.name,
    result: "success",
    createdAt: Date.now(),
  });
  await notify(
    deps,
    auditId,
    target.docId,
    args.groupId,
    args.operation,
    args.operation === "transfer_owner" ? args.sourceOwnerUserId : undefined,
  );
  return null;
}
