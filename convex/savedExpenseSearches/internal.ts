import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const E2E_CLEAR_BATCH_SIZE = 100;

/** E2E 専用: テストユーザーの保存した検索・最近の検索を1バッチ削除する。 */
export const clearE2eDataForUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("savedExpenseSearches")
      .withIndex("by_user_id_and_group_id_and_kind", (q) => q.eq("userId", userId))
      .take(E2E_CLEAR_BATCH_SIZE);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deletedCount: rows.length, hasMore: rows.length >= E2E_CLEAR_BATCH_SIZE };
  },
});
