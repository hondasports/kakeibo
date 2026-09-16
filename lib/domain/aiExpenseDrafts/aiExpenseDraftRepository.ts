/**
 * aiExpenseDrafts リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { AiExpenseDraftStatus } from "./constants";
import type { AiExpenseDraftFields, AiExpenseDraftPatch } from "./aiExpenseDraft";

export interface AiExpenseDraftReadRepository {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<AiExpenseDraftFields | null>;
  /** グループ+ステータスで作成日時降順に取得する。 */
  listByGroupAndStatus(
    groupId: string,
    status: AiExpenseDraftStatus,
    limit: number,
  ): Promise<AiExpenseDraftFields[]>;
}

export interface AiExpenseDraftRepository extends AiExpenseDraftReadRepository {
  /** 部分更新する。 */
  patch(id: string, patch: AiExpenseDraftPatch): Promise<void>;
  /** 削除する。 */
  delete(id: string): Promise<void>;
}
