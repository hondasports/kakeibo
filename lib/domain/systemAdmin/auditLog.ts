/**
 * systemAdminAuditLogs のドメイン型とストア・ポート（domain interface）。
 */
import type { PaginatedResult, PaginationOpts } from "../pagination";
import type { GroupMembershipStatus } from "../groups/role";
import type { SystemAdminStatus } from "./systemAdminStore";

export const SYSTEM_ADMIN_AUDIT_ACTIONS = [
  "system_admin_bootstrapped",
  "system_admin_granted",
  "system_admin_revoked",
  "system_admin_recovered",
  "system_admin_user_searched",
  "system_admin_group_searched",
  "system_admin_user_viewed",
  "system_admin_group_viewed",
  "system_admin_membership_added",
  "system_admin_membership_removed",
  "system_admin_membership_transferred",
  "system_admin_active_group_set",
  "system_admin_active_group_cleared",
  "system_admin_group_deletion_resumed",
  "system_admin_ownerless_group_recovered",
  "system_admin_group_role_changed",
  "system_admin_group_owner_transferred",
  "system_admin_group_invitation_revoked",
  "system_admin_notification_setting_changed",
] as const;

export type SystemAdminAuditAction = (typeof SYSTEM_ADMIN_AUDIT_ACTIONS)[number];

/** systemAdminAuditLogs.actorType の全値。schema・API validator はこの並びに合わせる。 */
export const SYSTEM_ADMIN_AUDIT_ACTOR_TYPES = ["system", "system_admin"] as const;

export type SystemAdminAuditActorType = (typeof SYSTEM_ADMIN_AUDIT_ACTOR_TYPES)[number];

/** systemAdminAuditLogs.targetKind の全値。schema・API validator はこの並びに合わせる。 */
export const SYSTEM_ADMIN_AUDIT_TARGET_KINDS = [
  "system_admin",
  "user",
  "group",
  "invitation",
  "notification_setting",
] as const;

export type SystemAdminAuditTargetKind = (typeof SYSTEM_ADMIN_AUDIT_TARGET_KINDS)[number];

/** systemAdminAuditLogs.result の全値。schema・API validator はこの並びに合わせる。 */
export const SYSTEM_ADMIN_AUDIT_RESULTS = ["success", "denied"] as const;

export type SystemAdminAuditResult = (typeof SYSTEM_ADMIN_AUDIT_RESULTS)[number];

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
  previousStatus?: SystemAdminStatus;
  newStatus?: SystemAdminStatus;
  sourceGroupId?: string;
  sourceGroupNameSnapshot?: string;
  targetGroupId?: string;
  targetGroupNameSnapshot?: string;
  beforeMembershipStatus?: GroupMembershipStatus;
  afterMembershipStatus?: GroupMembershipStatus;
  beforeActiveGroupId?: string;
  afterActiveGroupId?: string;
  beforeOwnerCount?: number;
  afterOwnerCount?: number;
  beforeNotificationEnabled?: boolean;
  afterNotificationEnabled?: boolean;
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
