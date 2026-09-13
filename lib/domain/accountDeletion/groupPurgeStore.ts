/**
 * accountDeletionGroupPurges のドメイン型とストア・ポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
export type AccountDeletionGroupPurgeStatus = "pending" | "running" | "failed" | "completed";

export type AccountDeletionGroupPurgeFields = {
  requestId: string;
  groupDeletionJobId: string;
  targetGroupIdSnapshot: string;
  targetGroupNameSnapshot: string;
  status: AccountDeletionGroupPurgeStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

/** 永続化済みの purge 関連レコード。読み取り結果では id が必須。 */
export type AccountDeletionGroupPurgeRecord = AccountDeletionGroupPurgeFields & { id: string };

export interface AccountDeletionGroupPurgeStore {
  /** リクエスト×ステータスで最大 limit 件取得する。 */
  takeByRequestAndStatus(
    requestId: string,
    status: AccountDeletionGroupPurgeStatus,
    limit: number,
  ): Promise<AccountDeletionGroupPurgeRecord[]>;
  /** リクエストの関連を最大 limit 件取得する。 */
  takeByRequest(requestId: string, limit: number): Promise<AccountDeletionGroupPurgeRecord[]>;
  /** 削除ジョブ ID で関連を1件取得する（冪等チェック用）。 */
  findByGroupDeletionJobId(
    groupDeletionJobId: string,
  ): Promise<AccountDeletionGroupPurgeRecord | null>;
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: AccountDeletionGroupPurgeFields): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(purgeId: string, fields: Partial<AccountDeletionGroupPurgeFields>): Promise<void>;
  /** 物理削除する。 */
  delete(purgeId: string): Promise<void>;
}
