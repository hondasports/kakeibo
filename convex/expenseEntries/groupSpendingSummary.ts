import { v } from "convex/values";
import { query } from "../_generated/server";

export const getGroupSpendingSummary = query({
  args: { groupId: v.id("groups") },
  returns: v.object({ total: v.number(), count: v.number() }),
  handler: async (ctx, { groupId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("ログインが必要です");

    const entries = await ctx.db
      .query("expenseEntries")
      .withIndex("by_group_id_and_date", (q) => q.eq("groupId", groupId))
      .take(500);

    return {
      total: entries.reduce((sum, entry) => sum + entry.amount, 0),
      count: entries.length,
    };
  },
});
