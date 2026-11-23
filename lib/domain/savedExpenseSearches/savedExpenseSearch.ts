/**
 * 履歴検索の保存条件・最近の検索（savedExpenseSearches）のドメインルール。
 * Convex の ctx や Doc 型に依存しない。
 */

export class SavedExpenseSearchError extends Error {}

export type SavedExpenseSearchKind = "saved" | "recent";

export const MAX_SAVED_SEARCH_NAME_LENGTH = 30;
export const MAX_SEARCH_QUERY_LENGTH = 500;
export const MAX_SAVED_SEARCHES = 20;
export const MAX_RECENT_SEARCHES = 5;

export type SavedExpenseSearchFields = {
  id: string;
  userId: string;
  groupId: string;
  kind: SavedExpenseSearchKind;
  /** saved のみ。 */
  name?: string;
  /** `/search?` の後ろに付ける正規化済みの query 文字列。 */
  query: string;
  createdAt: number;
  updatedAt: number;
};

/** クライアントへ返す項目。userId・groupId は含めない。 */
export type SavedExpenseSearchView = {
  id: string;
  name?: string;
  query: string;
  createdAt: number;
  updatedAt: number;
};

/** query の前後空白を除き、長さを検証する。空なら空文字を返す。 */
export function normalizeSearchQuery(query: string): string {
  const normalized = query.trim();
  if (normalized.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new SavedExpenseSearchError("検索条件が長すぎます");
  }
  return normalized;
}

export function normalizeSavedSearchName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new SavedExpenseSearchError("名前を入力してください");
  }
  if (normalized.length > MAX_SAVED_SEARCH_NAME_LENGTH) {
    throw new SavedExpenseSearchError(
      `名前は${MAX_SAVED_SEARCH_NAME_LENGTH}文字以内で入力してください`,
    );
  }
  return normalized;
}

export function toSavedExpenseSearchView(fields: SavedExpenseSearchFields): SavedExpenseSearchView {
  const view: SavedExpenseSearchView = {
    id: fields.id,
    query: fields.query,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
  if (fields.name !== undefined) view.name = fields.name;
  return view;
}
