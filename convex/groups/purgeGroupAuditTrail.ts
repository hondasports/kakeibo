import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const purgeGroupAuditTrail = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.number(),
  handler: async (ctx, { groupId }) => {
    const groupLogs = await ctx.db
      .query("managementAuditLogs")
      .withIndex("by_group_id_and_created_at", (q) => q.eq("groupId", groupId))
      .take(200);
    const adminLogs = await ctx.db
      .query("systemAdminAuditLogs")
      .withIndex("by_source_group_id_and_target_user_id_and_action_and_result", (q) =>
        q.eq("sourceGroupId", groupId),
      )
      .take(200);

    for (const log of [...groupLogs, ...adminLogs]) {
      await ctx.db.delete(log._id);
    }
    return groupLogs.length + adminLogs.length;
  },
});
