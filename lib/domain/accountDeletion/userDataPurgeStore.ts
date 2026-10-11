/**
 * finalize 時に削除するユーザー紐付きデータのストア・ポート（domain interface）。
 * テーブル名とインデックスの対応付けは infrastructure 層が担う。
 */

/**
 * finalize で削除する userId 紐付きテーブル（ベース順序を維持）。
 * lineNotificationJobs は linkId で lineAccountLinks を参照するため、必ず lineAccountLinks より前に置く。
 * lineAccountLinks は LINE userId → ユーザーの解決と再連携の衝突判定に使われるので、取り残さない。
 */
export const ACCOUNT_DELETION_USER_PURGE_TABLES = [
  "lineWebhookEvents",
  "lineImageJobs",
  "lineNotificationJobs",
  "lineNotificationEvents",
  "lineLinkRequests",
  "lineLinkAuditLogs",
  "lineAccountLinks",
] as const;

export type AccountDeletionUserPurgeTable = (typeof ACCOUNT_DELETION_USER_PURGE_TABLES)[number];

export interface AccountDeletionUserDataPurgeStore {
  /** userId 紐付きテーブルのドキュメント ID を最大 limit 件取得する。 */
  takeUserScopedIds(
    table: AccountDeletionUserPurgeTable,
    userId: string,
    limit: number,
  ): Promise<string[]>;
  /** ドキュメントを物理削除する。 */
  deleteDocument(id: string): Promise<void>;
}
