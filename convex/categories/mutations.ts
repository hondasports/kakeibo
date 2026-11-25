import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import { DEFAULT_CATEGORIES, MAX_CATEGORIES_PER_GROUP } from "../../lib/domain/categories/defaults";
import { E2E_CATEGORY_NAME_PREFIX } from "../../lib/domain/categories/rules";
import {
  categoryRecordToDoc,
  createCategorySeedStore,
  createCategoryStore,
} from "../../lib/convex/categories/convexCategoryStore";
import type { CategoryMoveDirection } from "../../lib/domain/categories/category";
import { CategoryDomainError } from "../../lib/domain/categories/rules";
import { categoryMoveDirectionValidator } from "../../lib/convex/categories/validators";
import {
  createCategory as createCategoryUsecase,
  deactivateCategory as deactivateCategoryUsecase,
  moveCategory as moveCategoryUsecase,
  reactivateCategory as reactivateCategoryUsecase,
  seedDefaultCategories as seedDefaultCategoriesUsecase,
  updateCategory as updateCategoryUsecase,
} from "../../lib/usecase/categories";
import { toConvexEndpointError } from "../lib/errors";

export { MAX_CATEGORY_DESCRIPTION_LENGTH, MAX_CATEGORY_NAME_LENGTH } from "./normalize";
export { DEFAULT_CATEGORIES, MAX_CATEGORIES_PER_GROUP };
export { shouldRefreshLegacyDefaultCategoryColor } from "../../lib/domain/categories/defaults";
export { E2E_CATEGORY_NAME_PREFIX };

function convexError(error: unknown): never {
  toConvexEndpointError(error, [CategoryDomainError]);
}

/** seedDefaultCategories mutation の handler ロジック（テスト用に export） */
export async function seedDefaultCategoriesHandler(ctx: MutationCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    return await seedDefaultCategoriesUsecase(createCategorySeedStore(ctx), groupId, Date.now());
  } catch (error) {
    convexError(error);
  }
}

type CreateCategoryArgs = {
  name: string;
  color: string;
  description?: string;
};

/** createCategory mutation の handler ロジック（テスト用に export） */
export async function createCategoryHandler(
  ctx: MutationCtx,
  args: CreateCategoryArgs,
): Promise<Doc<"categories"> | null> {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    const record = await createCategoryUsecase(createCategoryStore(ctx), groupId, args, Date.now());
    return record === null ? null : categoryRecordToDoc(record);
  } catch (error) {
    convexError(error);
  }
}

type UpdateCategoryArgs = {
  categoryId: Id<"categories">;
  name: string;
  color: string;
  description?: string;
};

/** updateCategory mutation の handler ロジック（テスト用に export） */
export async function updateCategoryHandler(
  ctx: MutationCtx,
  args: UpdateCategoryArgs,
): Promise<Doc<"categories"> | null> {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    const record = await updateCategoryUsecase(createCategoryStore(ctx), groupId, args, Date.now());
    return record === null ? null : categoryRecordToDoc(record);
  } catch (error) {
    convexError(error);
  }
}

type DeactivateCategoryArgs = {
  categoryId: Id<"categories">;
};

/** deactivateCategory mutation の handler ロジック（テスト用に export） */
export async function deactivateCategoryHandler(
  ctx: MutationCtx,
  args: DeactivateCategoryArgs,
): Promise<Doc<"categories"> | null> {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    const record = await deactivateCategoryUsecase(
      createCategoryStore(ctx),
      groupId,
      args.categoryId,
      Date.now(),
    );
    return record === null ? null : categoryRecordToDoc(record);
  } catch (error) {
    convexError(error);
  }
}

type MoveCategoryArgs = {
  categoryId: Id<"categories">;
  direction: CategoryMoveDirection;
};

/** moveCategory mutation の handler ロジック（テスト用に export） */
export async function moveCategoryHandler(
  ctx: MutationCtx,
  args: MoveCategoryArgs,
): Promise<Doc<"categories"> | null> {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    const record = await moveCategoryUsecase(createCategoryStore(ctx), groupId, args, Date.now());
    return record === null ? null : categoryRecordToDoc(record);
  } catch (error) {
    convexError(error);
  }
}

type ReactivateCategoryArgs = {
  categoryId: Id<"categories">;
};

/** reactivateCategory mutation の handler ロジック（テスト用に export） */
export async function reactivateCategoryHandler(
  ctx: MutationCtx,
  args: ReactivateCategoryArgs,
): Promise<Doc<"categories"> | null> {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    const record = await reactivateCategoryUsecase(
      createCategoryStore(ctx),
      groupId,
      args.categoryId,
      Date.now(),
    );
    return record === null ? null : categoryRecordToDoc(record);
  } catch (error) {
    convexError(error);
  }
}

/**
 * 初回ログイン時にデフォルトカテゴリを seed する mutation。
 * groupId はサーバー側でグループメンバーシップから解決するため、
 * クライアントから groupId を渡さない。
 */
export const seedDefaultCategories = mutation({
  args: {},
  handler: seedDefaultCategoriesHandler,
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    description: v.optional(v.string()),
  },
  handler: createCategoryHandler,
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.string(),
    color: v.string(),
    description: v.optional(v.string()),
  },
  handler: updateCategoryHandler,
});

export const deactivateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
  },
  handler: deactivateCategoryHandler,
});

export const reactivateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
  },
  handler: reactivateCategoryHandler,
});

export const moveCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    direction: categoryMoveDirectionValidator,
  },
  handler: moveCategoryHandler,
});
