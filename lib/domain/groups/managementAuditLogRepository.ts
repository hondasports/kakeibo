/**
 * managementAuditLogs リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { ManagementAuditLogEntry, ManagementAuditLogRecord } from "./managementAudit";

export interface ManagementAuditLogReadRepository {
  /** グループの監査ログを createdAt 降順で取得する。limit 指定時は最大 limit 件。 */
  listByGroupDesc(groupId: string, limit?: number): Promise<ManagementAuditLogRecord[]>;
}

export interface ManagementAuditLogRecorder {
  /** 監査ログを記録し、採番された ID を返す。 */
  record(entry: ManagementAuditLogEntry): Promise<string>;
}
