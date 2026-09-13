import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import { DEFAULT_CATEGORIES, MAX_CATEGORIES_PER_GROUP } from "../../lib/domain/categories/defaults";
import { E2E_CATEGORY_NAME_PREFIX } from "../../lib/domain/categories/rules";
import {
  categoryRecordToDoc,
  createCategoryStore,
} from "../../lib/convex/categories/convexCategoryStore";
import {
  createCategory as createCategoryUsecase,
  deactivateCategory as deactivateCategoryUsecase,
  seedDefaultCategories as seedDefaultCategoriesUsecase,
  updateCategory as updateCategoryUsecase,
} from "../../lib/usecase/categories";

export { MAX_CATEGORY_DESCRIPTION_LENGTH, MAX_CATEGORY_NAME_LENGTH } from "./normalize";
export { DEFAULT_CATEGORIES, MAX_CATEGORIES_PER_GROUP };
export { shouldRefreshLegacyDefaultCategoryColor } from "../../lib/domain/categories/defaults";
export { E2E_CATEGORY_NAME_PREFIX };

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
}

/** seedDefaultCategories mutation の handler ロジック（テスト用に export） */
export async function seedDefaultCategoriesHandler(ctx: MutationCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    return await seedDefaultCategoriesUsecase(createCategoryStore(ctx), groupId, Date.now());
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
