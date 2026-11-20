/**
 * systemAdmins テーブルのドメイン型とストア・ポート（domain interface）。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { PaginatedResult, PaginationOpts } from "../pagination";

export type { PaginatedResult, PaginationOpts } from "../pagination";

/** systemAdmins.status の全値。schema・API validator はこの並び（active → revoked）に合わせる。 */
export const SYSTEM_ADMIN_STATUSES = ["active", "revoked"] as const;

/** systemAdmins レコードの状態。 */
export type SystemAdminStatus = (typeof SYSTEM_ADMIN_STATUSES)[number];

/** active な systemAdmin の数上限。超過判定は件数をこの値と比較する。 */
export const MAX_ACTIVE_SYSTEM_ADMINS = 100;

/** context 解決時の状態の全値。"none" は systemAdmin でない状態を表す。 */
export const SYSTEM_ADMIN_CONTEXT_STATUSES = [...SYSTEM_ADMIN_STATUSES, "none"] as const;

/** context 解決時の状態。 */
export type SystemAdminContextStatus = (typeof SYSTEM_ADMIN_CONTEXT_STATUSES)[number];

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
