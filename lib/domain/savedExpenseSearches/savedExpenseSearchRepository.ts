/**
 * savedExpenseSearches リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { SavedExpenseSearchFields, SavedExpenseSearchKind } from "./savedExpenseSearch";

export interface SavedExpenseSearchReadRepository {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<SavedExpenseSearchFields | null>;
  /** userId + groupId + kind の行を返す（順序は保証しない）。 */
  listByUserGroupAndKind(
    userId: string,
    groupId: string,
    kind: SavedExpenseSearchKind,
  ): Promise<SavedExpenseSearchFields[]>;
}

export interface SavedExpenseSearchRepository extends SavedExpenseSearchReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: Omit<SavedExpenseSearchFields, "id">): Promise<string>;
  /** updatedAt だけを更新する。 */
  touch(id: string, updatedAt: number): Promise<void>;
  /** 削除する。 */
  delete(id: string): Promise<void>;
}
