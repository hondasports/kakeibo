import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSystemAdmin } from "./systemAdmins";

export const listGroupExpensesForAdmin = query({
  args: { groupId: v.id("groups") },
  returns: v.array(v.object({ title: v.string(), amount: v.number(), date: v.string() })),
  handler: async (ctx, { groupId }) => {
    await requireSystemAdmin(ctx);

    const entries = await ctx.db
      .query("expenseEntries")
      .withIndex("by_group_id_and_date", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(50);

    return entries.map(({ title, amount, date }) => ({ title, amount, date }));
  },
});
