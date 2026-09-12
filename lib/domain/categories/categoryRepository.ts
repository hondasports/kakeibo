/**
 * categories リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */

/** ユースケースが必要とするカテゴリの最小形状。 */
export type CategoryRecord = {
  id: string;
  groupId: string;
  name: string;
  isActive: boolean;
};

export interface CategoryRepository {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<CategoryRecord | null>;
}
