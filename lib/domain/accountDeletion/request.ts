/**
 * accountDeletionRequests のドメイン型（domain interface）。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
export type AccountDeletionRequestStatus =
  | "requested"
  | "preparing_groups"
  | "purging_groups"
  | "deleting_identity"
  | "retry_wait"
  | "identity_deleted"
  | "finalization_retry_wait"
  | "completed"
  | "failed";

/** accountDeletionRequests ドキュメントのフィールド（書き込み用。id は採番前のため含まない）。 */
export type AccountDeletionRequestFields = {
  userId: string;
  clerkUserId: string;
  recipientEmailSnapshot?: string;
  status: AccountDeletionRequestStatus;
  leftGroupCount: number;
  deletedGroupCount: number;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: number;
  updatedAt: number;
  identityDeletedAt?: number;
  completedAt?: number;
  preparationCursor?: string;
  preparationCompletedAt?: number;
};

/** 永続化済みの accountDeletionRequests レコード。読み取り結果では id が必須。 */
export type AccountDeletionRequestRecord = AccountDeletionRequestFields & { id: string };

export interface AccountDeletionRequestReader {
  /** ID で削除リクエストを1件取得する。 */
  get(requestId: string): Promise<AccountDeletionRequestRecord | null>;
  /** ユーザーのリクエストを bounded 件数まで取得する。 */
  listByUser(userId: string, limit: number): Promise<AccountDeletionRequestRecord[]>;
}

export interface AccountDeletionRequestStore extends AccountDeletionRequestReader {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: AccountDeletionRequestFields): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(requestId: string, fields: Partial<AccountDeletionRequestFields>): Promise<void>;
  /** completed かつ updatedAt が cutoff より古いリクエストを最大 limit 件取得する。 */
  listCompletedBefore(cutoff: number, limit: number): Promise<AccountDeletionRequestRecord[]>;
  /** リクエストを物理削除する。 */
  delete(requestId: string): Promise<void>;
}
