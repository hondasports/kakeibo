/**
 * pending 招待取消ユースケース（internalQuery/internalMutation 群の実体）。
 * 招待状態検証・取消確定・失敗監査・通知 dedupe 順序はベース維持。
 */
import { ConvexError } from "convex/values";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import type { SystemAdminMutationDeps, SystemAdminQueryDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

const ACTION = "system_admin_group_invitation_revoked" as const;

function normalizeReason(reason: string) {
  const result = normalizeSystemAdminReason(reason);
  if (!result.success) {
    throw new ConvexError(getNormalizeReasonErrorMessage(result.error));
  }
  return result.reason;
}

type InvitationDeps = Pick<
  SystemAdminMutationDeps,
  "admins" | "users" | "groups" | "memberships" | "invitations" | "auditLogs" | "notifications"
>;

async function readPendingInvitation(
  deps: Pick<SystemAdminQueryDeps, "groups" | "invitations">,
  groupId: string,
  invitationId: string,
) {
  const group = await deps.groups.get(groupId);
  if (!group || group.status !== "active") {
    throw new ConvexError("active状態のgroupだけを指定できます");
  }
  const invitation = await deps.invitations.findById(invitationId);
  if (!invitation) throw new ConvexError("招待が見つかりません");
  if (invitation.groupId !== groupId) throw new ConvexError("招待のgroup指定が一致しません");
  if (invitation.status !== "pending") {
    throw new ConvexError("pending招待だけを取り消せます");
  }
  return { group, invitation };
}

export async function getPendingInvitationForSystemAdmin(
  deps: Pick<SystemAdminQueryDeps, "admins" | "users" | "groups" | "invitations">,
  args: {
    tokenIdentifier: string;
    groupId: string;
    invitationId: string;
    reason: string;
  },
) {
  await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reason = normalizeReason(args.reason);
  const { group, invitation } = await readPendingInvitation(deps, args.groupId, args.invitationId);
  return {
    groupId: group.id,
    invitationId: invitation.id,
    groupName: group.name,
    email: invitation.email,
    clerkInvitationId: invitation.clerkInvitationId,
    reason,
  };
}

async function enqueueNotifications(
  deps: Pick<InvitationDeps, "memberships" | "users" | "admins" | "notifications">,
  auditId: string,
  groupId: string,
  invitationId: string,
  email: string,
) {
  const recipients = new Set<string>();
  const owners = await deps.memberships.listByGroupAndRole(groupId, "owner", 101);
  if (owners.length > 100) throw new ConvexError("owner数が上限を超えています");
  for (const owner of owners) {
    const user = await deps.users.findByUserId(owner.userId);
    if (user) recipients.add(user.docId);
  }
  const admins = await deps.admins.takeByStatus("active", 101);
  if (admins.length > 100) throw new ConvexError("active system admin数が上限を超えています");
  for (const admin of admins) recipients.add(admin.userId);

  const payloadJson = JSON.stringify({ action: ACTION, groupId, invitationId, email });
  const now = Date.now();
  for (const recipientUserId of recipients) {
    const dedupeKey = `${auditId}:user:${recipientUserId}`;
    await deps.notifications.insert({
      action: ACTION,
      recipientUserId,
      targetEmailSnapshot: email,
      dedupeKey,
      payloadJson,
      createdAt: now,
    });
  }
  await deps.notifications.insert({
    action: ACTION,
    recipientEmail: email,
    targetEmailSnapshot: email,
    dedupeKey: `${auditId}:email:${email}`,
    payloadJson,
    createdAt: now,
  });
}

async function insertAudit(
  deps: Pick<InvitationDeps, "auditLogs">,
  args: {
    actorUserId: string;
    groupId: string;
    groupName: string;
    invitationId: string;
    email: string;
    reason: string;
    result: "success" | "denied";
  },
) {
  return await deps.auditLogs.insert({
    action: ACTION,
    actorType: "system_admin",
    actorUserId: args.actorUserId,
    targetKind: "invitation",
    targetId: args.invitationId,
    targetDisplayNameSnapshot: args.email,
    sourceGroupId: args.groupId,
    sourceGroupNameSnapshot: args.groupName,
    reason: args.reason,
    result: args.result,
    createdAt: Date.now(),
  });
}

export async function completePendingInvitation(
  deps: InvitationDeps,
  args: {
    tokenIdentifier: string;
    groupId: string;
    invitationId: string;
    reason: string;
    expectedClerkInvitationId?: string;
  },
): Promise<null> {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reason = normalizeReason(args.reason);
  const { group, invitation } = await readPendingInvitation(deps, args.groupId, args.invitationId);
  if (invitation.clerkInvitationId !== args.expectedClerkInvitationId) {
    throw new ConvexError("招待状態が変わったため再読み込みしてください");
  }
  await deps.invitations.patch(invitation.id, { status: "revoked", updatedAt: Date.now() });
  const auditId = await insertAudit(deps, {
    actorUserId: actor.user.docId,
    groupId: group.id,
    groupName: group.name,
    invitationId: invitation.id,
    email: invitation.email,
    reason,
    result: "success",
  });
  await enqueueNotifications(deps, auditId, group.id, invitation.id, invitation.email);
  return null;
}

export async function recordRevokeFailure(
  deps: Pick<InvitationDeps, "admins" | "users" | "groups" | "invitations" | "auditLogs">,
  args: {
    tokenIdentifier: string;
    groupId: string;
    invitationId: string;
    reason: string;
  },
): Promise<null> {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reason = normalizeReason(args.reason);
  const { group, invitation } = await readPendingInvitation(deps, args.groupId, args.invitationId);
  await insertAudit(deps, {
    actorUserId: actor.user.docId,
    groupId: group.id,
    groupName: group.name,
    invitationId: invitation.id,
    email: invitation.email,
    reason,
    result: "denied",
  });
  return null;
}
