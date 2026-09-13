/**
 * systemAdmins テーブルのドメイン型とストア・ポート（domain interface）。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { PaginatedResult, PaginationOpts } from "../pagination";

export type { PaginatedResult, PaginationOpts } from "../pagination";

export type SystemAdminStatus = "active" | "revoked";

/** systemAdmins ドキュメントのフィールド（書き込み用。id は採番前のため含まない）。 */
export type SystemAdminFields = {
  userId: string;
  status: SystemAdminStatus;
  createdAt: number;
  updatedAt: number;
  grantedAt: number;
  grantedByUserId?: string;
  grantReason: string;
  revokedAt?: number;
  revokedByUserId?: string;
  revokeReason?: string;
};

/** 永続化済みの systemAdmins レコード。読み取り結果では id が必須。 */
export type SystemAdminRecord = SystemAdminFields & { id: string };

export interface SystemAdminReadStore {
  /** userId（users ドキュメントID）で管理者レコードを1件取得する。重複時はエラーを投げる。 */
  findByUserDocId(userDocId: string): Promise<SystemAdminRecord | null>;
  /** ステータスで最大 limit 件取得する。 */
  takeByStatus(status: SystemAdminStatus, limit: number): Promise<SystemAdminRecord[]>;
  /** ステータスで updatedAt 降順ページネーションする。 */
  paginateByStatus(
    status: SystemAdminStatus,
    opts: PaginationOpts,
  ): Promise<PaginatedResult<SystemAdminRecord>>;
}

export interface SystemAdminStore extends SystemAdminReadStore {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: SystemAdminFields): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(id: string, fields: Partial<SystemAdminFields>): Promise<void>;
}
