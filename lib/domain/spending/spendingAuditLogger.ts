/**
 * 支出一括操作の監査ログ記録ポート（domain interface）。
 * 実装は infrastructure 層（convex/groups の監査ログ）が提供する。
 */
import type {
  BULK_SPENDING_CATEGORY_CHANGED_ACTION,
  BULK_SPENDING_DELETED_ACTION,
} from "./bulkSpendingAudit";

export type SpendingAuditAction =
  | typeof BULK_SPENDING_CATEGORY_CHANGED_ACTION
  | typeof BULK_SPENDING_DELETED_ACTION;

export type SpendingAuditEntry = {
  groupId: string;
  actorUserId: string;
  action: SpendingAuditAction;
  targetLabel: string;
  /** 監査スナップショットの JSON 文字列。 */
  afterValue: string;
};

export interface SpendingAuditLogger {
  record(entry: SpendingAuditEntry): Promise<void>;
}
