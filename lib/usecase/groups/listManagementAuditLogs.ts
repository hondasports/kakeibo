/**
 * 管理監査ログ一覧取得ユースケース（query。オーナーのみ。権限確認は presentation 層で解決済み）。
 * 直近50件を actor 表示名つきで返す。
 */
import type { ManagementAuditLogReadRepository } from "../../domain/groups/managementAuditLogRepository";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";
import type { ManagementAuditAction } from "../../domain/groups/managementAudit";
import type { UsecaseGroupContext } from "../context";

export const MANAGEMENT_AUDIT_LOG_LIST_LIMIT = 50;

export type ManagementAuditLogListItem = {
  logId: string;
  action: ManagementAuditAction;
  actorDisplayName: string;
  targetLabel: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  createdAt: number;
};

export async function listManagementAuditLogs(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    auditLogs: ManagementAuditLogReadRepository;
    users: UserDirectoryRead;
  },
): Promise<ManagementAuditLogListItem[]> {
  const logs = await deps.auditLogs.listByGroupDesc(ctx.groupId, MANAGEMENT_AUDIT_LOG_LIST_LIMIT);

  const uniqueActorUserIds = [...new Set(logs.map((log) => log.actorUserId))];
  const actorDisplayNamesByUserId = new Map<string, string>();
  await Promise.all(
    uniqueActorUserIds.map(async (actorUserId) => {
      const actor = await deps.users.findByUserId(actorUserId);
      actorDisplayNamesByUserId.set(actorUserId, actor?.displayName ?? "ユーザー");
    }),
  );

  return logs.map((log) => ({
    logId: log.id!,
    action: log.action,
    actorDisplayName: actorDisplayNamesByUserId.get(log.actorUserId) ?? "ユーザー",
    targetLabel: log.targetLabel ?? null,
    beforeValue: log.beforeValue ?? null,
    afterValue: log.afterValue ?? null,
    createdAt: log.createdAt,
  }));
}
