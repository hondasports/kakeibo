/**
 * systemAdminAuditLogs のドメイン型とストア・ポート（domain interface）。
 */
import type { PaginatedResult, PaginationOpts } from "../pagination";

export type SystemAdminAuditAction =
  | "system_admin_bootstrapped"
  | "system_admin_granted"
  | "system_admin_revoked"
  | "system_admin_recovered"
  | "system_admin_user_searched"
  | "system_admin_group_searched"
  | "system_admin_user_viewed"
  | "system_admin_group_viewed"
  | "system_admin_membership_added"
  | "system_admin_membership_removed"
  | "system_admin_membership_transferred"
  | "system_admin_active_group_set"
  | "system_admin_active_group_cleared"
  | "system_admin_group_deletion_resumed"
  | "system_admin_ownerless_group_recovered"
  | "system_admin_group_role_changed"
  | "system_admin_group_owner_transferred"
  | "system_admin_group_invitation_revoked";

export type SystemAdminAuditActorType = "system" | "system_admin";
export type SystemAdminAuditTargetKind = "system_admin" | "user" | "group" | "invitation";
export type SystemAdminAuditResult = "success" | "denied";

/** systemAdminAuditLogs ドキュメントのフィールド（書き込み用）。 */
export type SystemAdminAuditLogFields = {
  action: SystemAdminAuditAction;
  actorType: SystemAdminAuditActorType;
  actorUserId?: string;
  targetKind: SystemAdminAuditTargetKind;
  targetUserId?: string;
  targetDisplayNameSnapshot?: string;
  sourceUserId?: string;
  sourceUserDisplayNameSnapshot?: string;
  targetId?: string;
  reason?: string;
  queryType?: string;
  queryHash?: string;
  resultCount?: number;
  previousStatus?: "active" | "revoked";
  newStatus?: "active" | "revoked";
  sourceGroupId?: string;
  sourceGroupNameSnapshot?: string;
  targetGroupId?: string;
  targetGroupNameSnapshot?: string;
  beforeMembershipStatus?: "none" | "member" | "owner";
  afterMembershipStatus?: "none" | "member" | "owner";
  beforeActiveGroupId?: string;
  afterActiveGroupId?: string;
  beforeOwnerCount?: number;
  afterOwnerCount?: number;
  result?: SystemAdminAuditResult;
  createdAt: number;
};

export type SystemAdminAuditLogRecord = SystemAdminAuditLogFields & { id: string };

/** 監査ログ一覧のフィルタ。指定された組み合わせに応じてインフラ側が index を選択する。 */
export type SystemAdminAuditLogFilter = {
  from: number;
  to: number;
  action?: SystemAdminAuditAction;
  actorUserId?: string;
  targetUserId?: string;
};

export interface SystemAdminAuditLogReader {
  /** フィルタ条件で createdAt 降順ページネーションする。 */
  paginate(
    filter: SystemAdminAuditLogFilter,
    opts: PaginationOpts,
  ): Promise<PaginatedResult<SystemAdminAuditLogRecord>>;
}

export interface SystemAdminAuditLogStore extends SystemAdminAuditLogReader {
  /** 監査ログを挿入し、採番された ID を返す。 */
  insert(fields: SystemAdminAuditLogFields): Promise<string>;
}
