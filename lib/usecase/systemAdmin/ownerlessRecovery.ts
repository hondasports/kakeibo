/**
 * recoverOwnerlessGroup ユースケース。
 */
import { ConvexError } from "convex/values";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import type { SystemAdminMutationDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

const MAX_OWNERS = 100;

type Deps = Pick<
  SystemAdminMutationDeps,
  "admins" | "users" | "groups" | "memberships" | "auditLogs" | "notifications"
>;

async function enqueueNotifications(
  deps: Pick<Deps, "admins" | "notifications">,
  targetUserId: string,
  groupId: string,
  auditId: string,
) {
  const recipients = new Set<string>([targetUserId]);
  const admins = await deps.admins.takeByStatus("active", 101);
  if (admins.length > 100) throw new ConvexError("active system admin数が上限を超えています");
  for (const admin of admins) recipients.add(admin.userId);
  const now = Date.now();
  for (const recipientUserId of recipients) {
    const dedupeKey = `${auditId}:${recipientUserId}`;
    const existing = await deps.notifications.findByDedupeKey(dedupeKey);
    if (existing) continue;
    await deps.notifications.insert({
      action: "system_admin_ownerless_group_recovered",
      recipientUserId,
      targetUserId,
      dedupeKey,
      payloadJson: JSON.stringify({
        action: "system_admin_ownerless_group_recovered",
        groupId,
      }),
      createdAt: now,
    });
  }
}

export async function recoverOwnerlessGroup(
  deps: Deps,
  args: { tokenIdentifier: string; groupId: string; targetUserId: string; reason: string },
): Promise<null> {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reasonResult = normalizeSystemAdminReason(args.reason);
  if (!reasonResult.success) {
    throw new ConvexError(getNormalizeReasonErrorMessage(reasonResult.error));
  }
  const reason = reasonResult.reason;
  const group = await deps.groups.get(args.groupId);
  if (!group) throw new ConvexError("対象グループが存在しません");
  if (group.status !== "active") {
    throw new ConvexError("削除中・削除済み・アーカイブ済みグループは復旧できません");
  }
  const owners = await deps.memberships.listByGroupAndRole(args.groupId, "owner", MAX_OWNERS + 1);
  if (owners.length > MAX_OWNERS) throw new ConvexError("owner数が上限を超えています");
  if (owners.length > 0)
    throw new ConvexError("ownerが存在するグループは通常のowner操作を使ってください");
  const target = await deps.users.findByDocId(args.targetUserId);
  if (!target) throw new ConvexError("対象ユーザーが存在しません");
  const membership = await deps.memberships.findByGroupAndUser(args.groupId, target.userId);
  if (!membership || membership.role !== "member") {
    throw new ConvexError("対象ユーザーは既存memberではありません");
  }
  await deps.memberships.patch(membership.id, { role: "owner", updatedAt: Date.now() });
  const auditId = await deps.auditLogs.insert({
    action: "system_admin_ownerless_group_recovered",
    actorType: "system_admin",
    actorUserId: actor.user.docId,
    targetKind: "group",
    targetUserId: target.docId,
    targetId: args.groupId,
    targetDisplayNameSnapshot: group.name,
    reason,
    beforeOwnerCount: 0,
    afterOwnerCount: 1,
    result: "success",
    createdAt: Date.now(),
  });
  await enqueueNotifications(deps, target.docId, args.groupId, auditId);
  return null;
}
