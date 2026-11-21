import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireGroupMembershipForGroup } from "../groups/membership";

export const listGroupSpendingPreview = query({
  args: { groupId: v.id("groups") },
  returns: v.array(v.object({ title: v.string(), amount: v.number(), date: v.string() })),
  handler: async (ctx, { groupId }) => {
    const membership = await requireGroupMembershipForGroup(ctx, groupId);
    const entries = await ctx.db
      .query("expenseEntries")
      .withIndex("by_group_id_and_date", (q) => q.eq("groupId", membership.groupId))
      .order("desc")
      .take(20);

    return entries.map(({ title, amount, date }) => ({ title, amount, date }));
  },
});
