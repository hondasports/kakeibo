import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireAuthenticatedUserId } from "../users/auth";
import { createLineLinkMutationDeps } from "../../lib/convex/lineLink/lineLinkDeps";
import { unlinkLineAccount } from "../../lib/usecase/lineLink/statusAndUnlink";

export const unlink = mutation({
  args: {},
  returns: v.object({ status: v.literal("unlinked") }),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return unlinkLineAccount(createLineLinkMutationDeps(ctx), userId);
  },
});
