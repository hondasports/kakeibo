/**
 * entryFavorites リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { EntryFavoriteFields } from "./entryFavorite";

export interface EntryFavoriteReadRepository {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<EntryFavoriteFields | null>;
  /** userId + groupId のお気に入りを作成日時の新しい順で返す。 */
  listByUserAndGroup(userId: string, groupId: string): Promise<EntryFavoriteFields[]>;
}

export interface EntryFavoriteRepository extends EntryFavoriteReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: Omit<EntryFavoriteFields, "id">): Promise<string>;
  /** 削除する。 */
  delete(id: string): Promise<void>;
}
