import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAuthenticatedUserId } from "../users/auth";
import { createLineLinkQueryDeps } from "../../lib/convex/lineLink/lineLinkDeps";
import { getLineLinkStatus } from "../../lib/usecase/lineLink/statusAndUnlink";

export const getStatus = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal("unlinked") }),
    v.object({ status: v.literal("linked"), linkedAt: v.number() }),
  ),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return getLineLinkStatus(createLineLinkQueryDeps(ctx).accountLinks, userId);
  },
});
