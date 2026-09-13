/**
 * categories endpoint の純粋なドメインルール。
 * Convex の ctx や Doc 型に依存しない。
 */
import { shouldRefreshLegacyDefaultCategoryColor, type DefaultCategory } from "./defaults";

/** E2E テスト用カテゴリ名の prefix。presentation 層から再 export される。 */
export const E2E_CATEGORY_NAME_PREFIX = "E2Eカテゴリ-";

type ExistingSeedCategory = {
  name: string;
  description?: string;
  color: string;
  sortOrder: number;
};

export type SeedCategoryPatch = {
  color?: string;
  description?: string;
  updatedAt: number;
};

/**
 * seed 対象の sortOrder に既存カテゴリがある場合の patch を決定する。
 * 変更が不要なら null を返す（呼び出し側は patch をスキップする）。
 *
 * - レガシー配色のまま残っているデフォルトカテゴリは現行色へ更新する
 * - 名前が一致し description 未設定なら補完する
 */
export function buildSeedPatch(
  existing: ExistingSeedCategory,
  nextDefault: DefaultCategory,
  now: number,
): SeedCategoryPatch | null {
  const patch: SeedCategoryPatch = { updatedAt: now };
  if (shouldRefreshLegacyDefaultCategoryColor(existing, nextDefault)) {
    patch.color = nextDefault.color;
  }
  if (existing.name === nextDefault.name && existing.description === undefined) {
    patch.description = nextDefault.description;
  }
  return Object.keys(patch).length > 1 ? patch : null;
}

/** グループあたりのカテゴリ上限を検証する。 */
export function assertCategoryLimit(count: number, max: number): void {
  if (count >= max) {
    throw new Error("Category limit reached");
  }
}

/** 既存カテゴリの最大 sortOrder + 1 を返す（0 件なら 1）。 */
export function nextSortOrder(existing: { sortOrder: number }[]): number {
  return existing.reduce((max, category) => Math.max(max, category.sortOrder), 0) + 1;
}

/**
 * 所有権を検証して対象カテゴリを返す。
 * 不存在・別グループ所属はそれぞれ既存と同じ文言で拒否する。
 */
export function assertOwnedCategory<T extends { groupId: string }>(
  category: T | null,
  groupId: string,
): T {
  if (category === null) {
    throw new Error("Category not found");
  }
  if (category.groupId !== groupId) {
    throw new Error("Category does not belong to the current group");
  }
  return category;
}

/** E2E 用カテゴリ名が必須 prefix を持つか検証する。 */
export function assertE2eCategoryName(name: string): void {
  if (!name.startsWith(E2E_CATEGORY_NAME_PREFIX)) {
    throw new Error("E2E category name must start with the E2E prefix");
  }
}
