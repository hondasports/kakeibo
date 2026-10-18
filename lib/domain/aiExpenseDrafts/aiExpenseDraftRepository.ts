/**
 * aiExpenseDrafts リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { AiExpenseDraftStatus } from "./constants";
import type { AiExpenseDraftFields, AiExpenseDraftPatch } from "./aiExpenseDraft";
import type { PaginatedResult, PaginationOpts } from "../pagination";

export interface AiExpenseDraftReadRepository {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<AiExpenseDraftFields | null>;
  /** グループ+ステータスで作成日時降順に取得する。registered は登録日時降順。 */
  listByGroupAndStatus(
    groupId: string,
    status: AiExpenseDraftStatus,
    limit: number,
  ): Promise<AiExpenseDraftFields[]>;
  /** グループ+ステータスで作成日時降順にページング取得する。registered は登録日時降順。 */
  paginateByGroupAndStatus(
    groupId: string,
    status: AiExpenseDraftStatus,
    opts: PaginationOpts,
  ): Promise<PaginatedResult<AiExpenseDraftFields>>;
}

export interface AiExpenseDraftRepository extends AiExpenseDraftReadRepository {
  /** 部分更新する。 */
  patch(id: string, patch: AiExpenseDraftPatch): Promise<void>;
  /** 削除する。 */
  delete(id: string): Promise<void>;
}
