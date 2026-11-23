import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  deleteEntryFavoriteHandler,
  saveEntryFavoriteHandler,
} from "../../lib/convex/entryFavorites/entryFavoriteHandlers";

// テスト・他モジュール互換のためハンドラを再公開する
export { deleteEntryFavoriteHandler, saveEntryFavoriteHandler };

export const saveEntryFavorite = mutation({
  args: {
    title: v.string(),
    categoryId: v.id("categories"),
    amountYen: v.number(),
    memo: v.optional(v.string()),
  },
  returns: v.id("entryFavorites"),
  handler: saveEntryFavoriteHandler,
});

export const deleteEntryFavorite = mutation({
  args: {
    entryFavoriteId: v.id("entryFavorites"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteEntryFavoriteHandler(ctx, args);
    return null;
  },
});
