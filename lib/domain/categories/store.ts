/**
 * categories endpoint 用ストアのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * CategoryRepository（usability 判定用の最小ポート）とは別の、
 * endpoint 操作に必要な完全形状を扱う。
 */

/** endpoint 操作で往復するカテゴリの完全形状。 */
export type CategoryStoreRecord = {
  id: string;
  creationTime: number;
  groupId: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type NewCategoryFields = {
  groupId: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type CategoryPatch = {
  name?: string;
  color?: string;
  description?: string;
  isActive?: boolean;
  updatedAt: number;
};

export interface CategoryStore {
  /** groupId+sortOrder で一意検索する。存在しなければ null。 */
  findByGroupAndSortOrder(groupId: string, sortOrder: number): Promise<CategoryStoreRecord | null>;
  /** groupId のカテゴリを先頭 limit 件だけ取得する（書き込み判定用）。 */
  listForWriteByGroup(groupId: string, limit: number): Promise<CategoryStoreRecord[]>;
  /** groupId のアクティブなカテゴリを sortOrder 昇順で全件返す。 */
  listActive(groupId: string): Promise<CategoryStoreRecord[]>;
  /** groupId の全カテゴリを sortOrder 昇順で先頭 limit 件返す。 */
  listForSettings(groupId: string, limit: number): Promise<CategoryStoreRecord[]>;
  /** ID で取得する。存在しなければ null。 */
  get(id: string): Promise<CategoryStoreRecord | null>;
  insert(fields: NewCategoryFields): Promise<string>;
  patch(id: string, patch: CategoryPatch): Promise<void>;
  /** 指定 ID をすべて削除する。 */
  deleteMany(ids: string[]): Promise<void>;
}
