/**
 * categories mutation のユースケース。
 * membership 認可は presentation 層で済んでいる前提で、
 * groupId を受け取ってドメインルールとストアを組み合わせる。
 */
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORIES_SEED_VERSION,
  MAX_CATEGORIES_PER_GROUP,
} from "../../domain/categories/defaults";
import type { CategoryMoveDirection } from "../../domain/categories/category";
import {
  normalizeCategoryColor,
  normalizeCategoryDescription,
  normalizeCategoryName,
} from "../../domain/categories/normalize";
import {
  assertCategoryLimit,
  assertOwnedCategory,
  buildSeedPatch,
  CategoryDomainError,
  nextSortOrder,
} from "../../domain/categories/rules";
import type {
  CategorySeedStore,
  CategoryStore,
  CategoryStoreRecord,
} from "../../domain/categories/store";

export async function seedDefaultCategories(
  store: CategorySeedStore,
  groupId: string,
  now: number,
): Promise<{ created: number; skipped: number }> {
  const group = await store.getGroupSeedState(groupId);
  if (group === null) {
    throw new CategoryDomainError("グループが見つかりません");
  }
  if (group.defaultCategoriesSeedVersion === DEFAULT_CATEGORIES_SEED_VERSION) {
    return { created: 0, skipped: DEFAULT_CATEGORIES.length };
  }

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

  await store.setGroupSeedVersion(groupId, DEFAULT_CATEGORIES_SEED_VERSION);
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

export async function reactivateCategory(
  store: CategoryStore,
  groupId: string,
  categoryId: string,
  now: number,
): Promise<CategoryStoreRecord | null> {
  const category = await store.get(categoryId);
  assertOwnedCategory(category, groupId);

  await store.patch(categoryId, {
    isActive: true,
    updatedAt: now,
  });

  return await store.get(categoryId);
}

export type MoveCategoryInput = {
  categoryId: string;
  direction: CategoryMoveDirection;
};

/**
 * カテゴリを並び順で1つ移動する。先頭/末尾への移動や該当なしは no-op で対象を返す。
 * sortOrder はスワップのみで、未整列（重複・欠番）でも他の行は書き換えない。
 */
export async function moveCategory(
  store: CategoryStore,
  groupId: string,
  args: MoveCategoryInput,
  now: number,
): Promise<CategoryStoreRecord | null> {
  const category = assertOwnedCategory(await store.get(args.categoryId), groupId);

  const siblings = await store.listForSettings(groupId, MAX_CATEGORIES_PER_GROUP);
  const index = siblings.findIndex((item) => item.id === args.categoryId);
  const neighborIndex = args.direction === "up" ? index - 1 : index + 1;
  if (index < 0 || neighborIndex < 0 || neighborIndex >= siblings.length) {
    return category;
  }

  const neighbor = siblings[neighborIndex];
  await store.patch(args.categoryId, { sortOrder: neighbor.sortOrder, updatedAt: now });
  await store.patch(neighbor.id, { sortOrder: category.sortOrder, updatedAt: now });

  return await store.get(args.categoryId);
}
