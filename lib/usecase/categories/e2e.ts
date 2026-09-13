/**
 * E2E テストデータクリーンアップ専用の categories ユースケース。
 * internal mutation からのみ呼ばれ、membership 認可は行わない。
 */
import { MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import { normalizeCategoryColor, normalizeCategoryName } from "../../domain/categories/normalize";
import {
  assertCategoryLimit,
  assertE2eCategoryName,
  E2E_CATEGORY_NAME_PREFIX,
  nextSortOrder,
} from "../../domain/categories/rules";
import type { CategoryStore } from "../../domain/categories/store";

export async function deleteE2eCategoriesByGroup(
  store: CategoryStore,
  groupId: string,
): Promise<{ deletedCount: number }> {
  const categories = await store.listForWriteByGroup(groupId, MAX_CATEGORIES_PER_GROUP);
  const targets = categories.filter((category) =>
    category.name.startsWith(E2E_CATEGORY_NAME_PREFIX),
  );

  await store.deleteMany(targets.map((category) => category.id));

  return { deletedCount: targets.length };
}

export async function ensureE2eCategory(
  store: CategoryStore,
  args: { groupId: string; name: string; color: string },
  now: number,
): Promise<string> {
  assertE2eCategoryName(args.name);

  const normalizedName = normalizeCategoryName(args.name);
  const normalizedColor = normalizeCategoryColor(args.color);
  const existing = await store.listForWriteByGroup(args.groupId, MAX_CATEGORIES_PER_GROUP);

  const matched = existing.find((category) => category.name === normalizedName);

  if (matched) {
    await store.patch(matched.id, {
      color: normalizedColor,
      isActive: true,
      updatedAt: now,
    });
    return matched.id;
  }

  assertCategoryLimit(existing.length, MAX_CATEGORIES_PER_GROUP);

  const sortOrder = nextSortOrder(existing);
  return await store.insert({
    groupId: args.groupId,
    name: normalizedName,
    color: normalizedColor,
    isActive: true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
}
