/**
 * categories mutation のユースケース。
 * membership 認可は presentation 層で済んでいる前提で、
 * groupId を受け取ってドメインルールとストアを組み合わせる。
 */
import { DEFAULT_CATEGORIES, MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import {
  normalizeCategoryColor,
  normalizeCategoryDescription,
  normalizeCategoryName,
} from "../../domain/categories/normalize";
import {
  assertCategoryLimit,
  assertOwnedCategory,
  buildSeedPatch,
  nextSortOrder,
} from "../../domain/categories/rules";
import type { CategoryStore, CategoryStoreRecord } from "../../domain/categories/store";

export async function seedDefaultCategories(
  store: CategoryStore,
  groupId: string,
  now: number,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const category of DEFAULT_CATEGORIES) {
    // 無効化済みのデフォルトカテゴリを、次回ログイン時に復活させない。
    // そのため active 状態に関係なく同じ sortOrder が既存なら seed 済みとして扱う。
    const existing = await store.findByGroupAndSortOrder(groupId, category.sortOrder);

    if (existing !== null) {
      const patch = buildSeedPatch(existing, category, now);
      if (patch !== null) {
        await store.patch(existing.id, patch);
      }
      skipped++;
      continue;
    }

    await store.insert({
      groupId,
      name: category.name,
      description: category.description,
      color: category.color,
      isActive: true,
      sortOrder: category.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }

  return { created, skipped };
}

export type CreateCategoryInput = {
  name: string;
  color: string;
  description?: string;
};

export async function createCategory(
  store: CategoryStore,
  groupId: string,
  args: CreateCategoryInput,
  now: number,
): Promise<CategoryStoreRecord | null> {
  const name = normalizeCategoryName(args.name);
  const color = normalizeCategoryColor(args.color);
  const description = normalizeCategoryDescription(args.description);
  const existing = await store.listForWriteByGroup(groupId, MAX_CATEGORIES_PER_GROUP);

  assertCategoryLimit(existing.length, MAX_CATEGORIES_PER_GROUP);

  const sortOrder = nextSortOrder(existing);
  const categoryId = await store.insert({
    groupId,
    name,
    ...(description === undefined ? {} : { description }),
    color,
    isActive: true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });

  return await store.get(categoryId);
}

export type UpdateCategoryInput = {
  categoryId: string;
  name: string;
  color: string;
  description?: string;
};

export async function updateCategory(
  store: CategoryStore,
  groupId: string,
  args: UpdateCategoryInput,
  now: number,
): Promise<CategoryStoreRecord | null> {
  const category = await store.get(args.categoryId);
  assertOwnedCategory(category, groupId);
  const name = normalizeCategoryName(args.name);
  const color = normalizeCategoryColor(args.color);
  const description = normalizeCategoryDescription(args.description);

  await store.patch(args.categoryId, {
    name,
    color,
    ...(description === undefined ? {} : { description }),
    updatedAt: now,
  });

  return await store.get(args.categoryId);
}

export async function deactivateCategory(
  store: CategoryStore,
  groupId: string,
  categoryId: string,
  now: number,
): Promise<CategoryStoreRecord | null> {
  const category = await store.get(categoryId);
  assertOwnedCategory(category, groupId);

  await store.patch(categoryId, {
    isActive: false,
    updatedAt: now,
  });

  return await store.get(categoryId);
}
