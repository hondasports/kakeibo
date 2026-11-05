import { internalMutation, internalQuery } from "../_generated/server";
import { ConvexError, v } from "convex/values";
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

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  // ドメインエラーだけを endpoint 契約の ConvexError へ変換する。
  // DB・アダプタ由来の予期しないエラーはそのまま再送出し、メッセージを露出させない。
  if (error instanceof CategoryDomainError) throw new ConvexError(error.message);
  throw error;
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
