/**
 * aiExpenseDraftItems リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";

export interface AiExpenseDraftItemReadRepository {
  /**
   * 下書きの明細を昇順で取得する。limit 指定時は最大 limit 件。
   */
  listByDraftAsc(
    groupId: string,
    draftId: string,
    limit?: number,
  ): Promise<AiExpenseDraftItemFields[]>;
  /** 下書きの明細を全件取得する（順序はストレージ順）。 */
  listAllByDraft(groupId: string, draftId: string): Promise<AiExpenseDraftItemFields[]>;
}

export interface AiExpenseDraftItemRepository extends AiExpenseDraftItemReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: Omit<AiExpenseDraftItemFields, "id" | "creationTime">): Promise<string>;
  /** 削除する。 */
  delete(id: string): Promise<void>;
}
