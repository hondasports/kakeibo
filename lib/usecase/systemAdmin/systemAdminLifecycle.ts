/**
 * systemAdmins ライフサイクルのユースケース群。
 * getMySystemAdminContext / listSystemAdmins / grant / revoke / bootstrap / recover。
 * 通知挿入（active 管理者全員 + 対象ユーザー、dedupe）と監査挿入の順序はベース維持。
 */
import { ConvexError } from "convex/values";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import type { PaginationOpts } from "../../domain/pagination";
import type { SystemAdminNotificationAction } from "../../domain/systemAdmin/notificationStore";
import type { SystemAdminAuditAction } from "../../domain/systemAdmin/auditLog";
import type { AppEnvironment } from "../../domain/systemAdmin/environment";
import type { SystemAdminMutationDeps, SystemAdminQueryDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

function normalizeReason(reason: string): string {
  const result = normalizeSystemAdminReason(reason);
  if (!result.success) {
    throw new ConvexError(getNormalizeReasonErrorMessage(result.error));
  }
  return result.reason;
}

async function insertNotifications(
  deps: Pick<SystemAdminMutationDeps, "admins" | "notifications">,
  action: SystemAdminNotificationAction,
  targetUserId: string,
  auditId: string,
  environment: AppEnvironment,
) {
  const recipients = new Set<string>([targetUserId]);
  let cursor: string | null = null;
  while (true) {
    const page = await deps.admins.paginateByStatus("active", { numItems: 100, cursor });
    for (const admin of page.page) recipients.add(admin.userId);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  const payloadJson = JSON.stringify({ action, targetUserId, environment });
  const now = Date.now();
  for (const recipientUserId of recipients) {
    const dedupeKey = `${auditId}:${recipientUserId}`;
    const existing = await deps.notifications.findByDedupeKey(dedupeKey);
    if (existing) continue;
    await deps.notifications.insert({
      action,
      recipientUserId,
      targetUserId,
      dedupeKey,
      payloadJson,
      createdAt: now,
    });
  }
}

export async function getMySystemAdminContext(
  deps: Pick<SystemAdminQueryDeps, "admins" | "users">,
  args: { tokenIdentifier: string | null; environment: AppEnvironment },
) {
  const { environment } = args;
  if (args.tokenIdentifier === null) return { status: "none" as const, environment };
  const user = await deps.users.findByUserId(args.tokenIdentifier);
  if (!user) return { status: "none" as const, environment };
  let admin = null;
  try {
    admin = await deps.admins.findByUserDocId(user.docId);
  } catch {
    return { status: "none" as const, environment };
  }
  if (admin?.status === "active") {
    return { status: "active" as const, environment, userId: user.docId };
  }
  if (admin?.status === "revoked") {
    return { status: "revoked" as const, environment };
  }
  return { status: "none" as const, environment };
}

export async function listSystemAdmins(
  deps: Pick<SystemAdminQueryDeps, "admins" | "users">,
  args: {
    tokenIdentifier: string;
    paginationOpts: PaginationOpts;
    status?: "active" | "revoked";
  },
) {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const status = args.status ?? "active";
  const page = await deps.admins.paginateByStatus(status, args.paginationOpts);
  const hasAnotherActiveAdmin = (await deps.admins.takeByStatus("active", 2)).length >= 2;
  const users = await Promise.all(page.page.map((admin) => deps.users.findByDocId(admin.userId)));
  return {
    ...page,
    hasAnotherActiveAdmin,
    page: page.page.map((admin, index) => ({
      id: admin.id,
      targetUserId: admin.userId,
      status: admin.status,
      displayName: users[index]?.displayName ?? "ユーザー",
      email: users[index]?.email ?? null,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      grantedAt: admin.grantedAt,
      revokedAt: admin.revokedAt,
      isSelf: admin.userId === actor.user.docId,
    })),
  };
}

export async function listSystemAdminAuditLogs(
  deps: Pick<SystemAdminQueryDeps, "admins" | "users" | "auditLogs">,
  args: {
    tokenIdentifier: string;
    paginationOpts: PaginationOpts;
    from?: number;
    to?: number;
    action?: SystemAdminAuditAction;
    actorUserId?: string;
    targetUserId?: string;
  },
) {
  await requireSystemAdminActor(deps, args.tokenIdentifier);
  const page = await deps.auditLogs.paginate(
    {
      from: args.from ?? 0,
      to: args.to ?? Number.MAX_SAFE_INTEGER,
      action: args.action,
      actorUserId: args.actorUserId,
      targetUserId: args.targetUserId,
    },
    args.paginationOpts,
  );
  const actors = await Promise.all(
    page.page.map((log) => (log.actorUserId ? deps.users.findByDocId(log.actorUserId) : null)),
  );
  return {
    ...page,
    page: page.page.map((log, index) => ({
      id: log.id,
      action: log.action,
      actorType: log.actorType,
      actorUserId: log.actorUserId,
      actorDisplayName: actors[index]?.displayName ?? null,
      targetUserId: log.targetUserId,
      targetId: log.targetId,
      targetDisplayName: log.targetDisplayNameSnapshot,
      sourceUserId: log.sourceUserId,
      sourceUserDisplayName: log.sourceUserDisplayNameSnapshot,
      reason: log.reason,
      queryHash: log.queryHash,
      resultCount: log.resultCount,
      result: log.result ?? "success",
      previousStatus: log.previousStatus,
      newStatus: log.newStatus,
      sourceGroupId: log.sourceGroupId,
      sourceGroupNameSnapshot: log.sourceGroupNameSnapshot,
      targetGroupId: log.targetGroupId,
      targetGroupNameSnapshot: log.targetGroupNameSnapshot,
      beforeMembershipStatus: log.beforeMembershipStatus,
      afterMembershipStatus: log.afterMembershipStatus,
      beforeActiveGroupId: log.beforeActiveGroupId,
      afterActiveGroupId: log.afterActiveGroupId,
      beforeOwnerCount: log.beforeOwnerCount,
      afterOwnerCount: log.afterOwnerCount,
      createdAt: log.createdAt,
    })),
  };
}

type AdminWriteDeps = Pick<
  SystemAdminMutationDeps,
  "admins" | "auditLogs" | "notifications" | "users"
>;

export async function grantSystemAdmin(
  deps: AdminWriteDeps,
  args: {
    tokenIdentifier: string;
    targetUserId: string;
    reason: string;
    environment: AppEnvironment;
  },
) {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reason = normalizeReason(args.reason);
  if (actor.user.docId === args.targetUserId) throw new ConvexError("自分自身は操作できません");
  const target = await deps.users.findByDocId(args.targetUserId);
  if (!target) throw new ConvexError("対象ユーザーが存在しません");
  let existing = null;
  try {
    existing = await deps.admins.findByUserDocId(args.targetUserId);
  } catch {
    throw new ConvexError("管理者レコードが不正です");
  }
  if (existing?.status === "active") throw new ConvexError("既に管理者です");
  const now = Date.now();
  if (!existing) {
    await deps.admins.insert({
      userId: args.targetUserId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      grantedAt: now,
      grantedByUserId: actor.user.docId,
      grantReason: reason,
    });
  } else {
    await deps.admins.patch(existing.id, {
      status: "active",
      updatedAt: now,
      grantedAt: now,
      grantedByUserId: actor.user.docId,
      grantReason: reason,
      revokedAt: undefined,
      revokedByUserId: undefined,
      revokeReason: undefined,
    });
  }
  const auditId = await deps.auditLogs.insert({
    action: "system_admin_granted",
    actorType: "system_admin",
    actorUserId: actor.user.docId,
    targetKind: "system_admin",
    targetUserId: args.targetUserId,
    targetDisplayNameSnapshot: target.displayName,
    reason,
    previousStatus: existing?.status,
    newStatus: "active",
    createdAt: Date.now(),
  });
  await insertNotifications(
    deps,
    "system_admin_granted",
    args.targetUserId,
    auditId,
    args.environment,
  );
  return { status: "active" as const, regranted: existing?.status === "revoked" };
}

export async function revokeSystemAdmin(
  deps: AdminWriteDeps,
  args: {
    tokenIdentifier: string;
    targetUserId: string;
    reason: string;
    environment: AppEnvironment;
  },
) {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reason = normalizeReason(args.reason);
  if (actor.user.docId === args.targetUserId) throw new ConvexError("自分自身は操作できません");
  const target = await deps.users.findByDocId(args.targetUserId);
  if (!target) throw new ConvexError("対象ユーザーが存在しません");
  const targetAdmin = await deps.admins.findByUserDocId(args.targetUserId);
  if (!targetAdmin || targetAdmin.status !== "active")
    throw new ConvexError("対象はactive管理者ではありません");
  const activeAdmins = await deps.admins.takeByStatus("active", 2);
  if (activeAdmins.length < 2) throw new ConvexError("最後の管理者は剥奪できません");
  const now = Date.now();
  await deps.admins.patch(targetAdmin.id, {
    status: "revoked",
    updatedAt: now,
    revokedAt: now,
    revokedByUserId: actor.user.docId,
    revokeReason: reason,
  });
  const auditId = await deps.auditLogs.insert({
    action: "system_admin_revoked",
    actorType: "system_admin",
    actorUserId: actor.user.docId,
    targetKind: "system_admin",
    targetUserId: args.targetUserId,
    targetDisplayNameSnapshot: target.displayName,
    reason,
    previousStatus: "active",
    newStatus: "revoked",
    createdAt: Date.now(),
  });
  await insertNotifications(
    deps,
    "system_admin_revoked",
    args.targetUserId,
    auditId,
    args.environment,
  );
  return { status: "revoked" as const };
}

export async function bootstrapSystemAdmin(
  deps: AdminWriteDeps,
  args: { targetUserId: string; reason: string; environment: AppEnvironment },
) {
  const reason = normalizeReason(args.reason);
  const target = await deps.users.findByDocId(args.targetUserId);
  if (!target) throw new ConvexError("対象ユーザーが存在しません");
  const active = await deps.admins.takeByStatus("active", 1);
  if (active.length > 0) throw new ConvexError("初回管理者は既に存在します");
  const existing = await deps.admins.findByUserDocId(args.targetUserId);
  if (existing) throw new ConvexError("対象ユーザーの管理者履歴が既に存在します");
  const now = Date.now();
  await deps.admins.insert({
    userId: args.targetUserId,
    status: "active",
    createdAt: now,
    updatedAt: now,
    grantedAt: now,
    grantReason: reason,
  });
  const auditId = await deps.auditLogs.insert({
    action: "system_admin_bootstrapped",
    actorType: "system",
    targetKind: "system_admin",
    targetUserId: args.targetUserId,
    targetDisplayNameSnapshot: target.displayName,
    reason,
    newStatus: "active",
    createdAt: Date.now(),
  });
  await insertNotifications(
    deps,
    "system_admin_bootstrapped",
    args.targetUserId,
    auditId,
    args.environment,
  );
  return { status: "active" as const };
}

export async function recoverSystemAdmin(
  deps: AdminWriteDeps,
  args: { targetUserId: string; reason: string; environment: AppEnvironment },
) {
  const reason = normalizeReason(args.reason);
  const target = await deps.users.findByDocId(args.targetUserId);
  if (!target) throw new ConvexError("対象ユーザーが存在しません");
  const active = await deps.admins.takeByStatus("active", 1);
  if (active.length > 0) throw new ConvexError("active管理者が存在するため復旧できません");
  const existing = await deps.admins.findByUserDocId(args.targetUserId);
  const now = Date.now();
  if (!existing) {
    await deps.admins.insert({
      userId: args.targetUserId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      grantedAt: now,
      grantReason: reason,
    });
  } else {
    await deps.admins.patch(existing.id, {
      status: "active",
      updatedAt: now,
      grantedAt: now,
      grantReason: reason,
      revokedAt: undefined,
      revokedByUserId: undefined,
      revokeReason: undefined,
    });
  }
  const auditId = await deps.auditLogs.insert({
    action: "system_admin_recovered",
    actorType: "system",
    targetKind: "system_admin",
    targetUserId: args.targetUserId,
    targetDisplayNameSnapshot: target.displayName,
    reason,
    previousStatus: existing?.status,
    newStatus: "active",
    createdAt: Date.now(),
  });
  await insertNotifications(
    deps,
    "system_admin_recovered",
    args.targetUserId,
    auditId,
    args.environment,
  );
  return { status: "active" as const };
}
