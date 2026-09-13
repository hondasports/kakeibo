/**
 * managementAuditLogs のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
export type ManagementAuditAction =
  | "group_name_changed"
  | "member_removed"
  | "invitation_revoked"
  | "member_role_changed"
  | "owner_transferred"
  | "group_archived"
  | "group_deleted"
  | "system_admin_granted"
  | "system_admin_revoked"
  | "system_admin_delegated"
  | "spending_bulk_category_changed"
  | "spending_bulk_deleted";

export type ManagementAuditTargetKind = "group" | "member" | "invitation";

/** managementAuditLogs ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type ManagementAuditLogFields = {
  id?: string;
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

/** 記録時に指定する監査ログの内容。createdAt は記録側が付与する。 */
export type ManagementAuditLogEntry = Omit<ManagementAuditLogFields, "id" | "createdAt">;
