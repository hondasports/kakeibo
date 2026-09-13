import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { createSystemAdminMutationDeps } from "../lib/convex/systemAdmin/systemAdminDeps";
import { recoverOwnerlessGroup as recoverOwnerlessGroupUsecase } from "../lib/usecase/systemAdmin";

export const recoverOwnerlessGroup = mutation({
  args: {
    groupId: v.id("groups"),
    targetUserId: v.id("users"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return await recoverOwnerlessGroupUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      ...args,
    });
  },
});
