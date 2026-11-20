import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  categoryRecordToDoc,
  createCategoryReader,
  createCategoryStore,
} from "../../lib/convex/categories/convexCategoryStore";
import { CategoryDomainError } from "../../lib/domain/categories/rules";
import { deleteE2eCategoriesByGroup, ensureE2eCategory } from "../../lib/usecase/categories";
import { listActive as listActiveUsecase } from "../../lib/usecase/categories";
import { requireGroupMembershipForGroup } from "../groups/membership";
import { toConvexEndpointError } from "../lib/errors";

function convexError(error: unknown): never {
  toConvexEndpointError(error, [CategoryDomainError]);
}

export const deleteE2eCategoriesByUser = internalMutation({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, { groupId }) => {
    try {
      return await deleteE2eCategoriesByGroup(createCategoryStore(ctx), groupId);
    } catch (error) {
      convexError(error);
    }
  },
});

/**
 * 処理開始時に確定した groupId のアクティブカテゴリを返す内部 query。
 * 呼び出し元（action）が渡す groupId はサーバー側で現在の所属を再検証する。
 */
export const listActiveForGroup = internalQuery({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMembershipForGroup(ctx, args.groupId);
    const records = await listActiveUsecase(createCategoryReader(ctx), args.groupId);
    return records.map(categoryRecordToDoc);
  },
});

export const ensureE2eCategoryByUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, { groupId, name, color }) => {
    try {
      const id = await ensureE2eCategory(
        createCategoryStore(ctx),
        { groupId, name, color },
        Date.now(),
      );
      return id as Id<"categories">;
    } catch (error) {
      convexError(error);
    }
  },
});
