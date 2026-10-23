/**
 * managementAuditLogs のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
export const MANAGEMENT_AUDIT_ACTIONS = [
  "group_name_changed",
  "member_removed",
  "invitation_revoked",
  "member_role_changed",
  "owner_transferred",
  "group_archived",
  "group_deleted",
  "system_admin_granted",
  "system_admin_revoked",
  "system_admin_delegated",
  "spending_bulk_category_changed",
  "spending_bulk_deleted",
] as const;

export type ManagementAuditAction = (typeof MANAGEMENT_AUDIT_ACTIONS)[number];

export const MANAGEMENT_AUDIT_TARGET_KINDS = ["group", "member", "invitation"] as const;

export type ManagementAuditTargetKind = (typeof MANAGEMENT_AUDIT_TARGET_KINDS)[number];

/** managementAuditLogs ドキュメントのフィールド（書き込み用。id は採番前のため含まない）。 */
export type ManagementAuditLogFields = {
  groupId: string;
  actorUserId: string;
  action: ManagementAuditAction;
  targetKind: ManagementAuditTargetKind;
  targetId?: string;
  targetLabel?: string;
  beforeValue?: string;
  afterValue?: string;
  createdAt: number;
};

/** 永続化済みの managementAuditLogs レコード。読み取り結果では id が必須。 */
export type ManagementAuditLogRecord = ManagementAuditLogFields & { id: string };

/** 記録時に指定する監査ログの内容。createdAt は記録側が付与する。 */
export type ManagementAuditLogEntry = Omit<ManagementAuditLogFields, "createdAt">;
