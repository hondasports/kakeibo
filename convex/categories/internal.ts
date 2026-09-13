import { internalMutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { createCategoryStore } from "../../lib/convex/categories/convexCategoryStore";
import { deleteE2eCategoriesByGroup, ensureE2eCategory } from "../../lib/usecase/categories";

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
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
