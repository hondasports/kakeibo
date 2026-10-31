import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { createSystemAdminMutationDeps } from "../lib/convex/systemAdmin/systemAdminDeps";
import { systemAdminMembershipOperationValidator } from "../lib/convex/systemAdmin/validators";
import { systemAdminMembershipOperation as systemAdminMembershipOperationUsecase } from "../lib/usecase/systemAdmin";

const resultValidator = v.object({
  operation: systemAdminMembershipOperationValidator,
  status: v.literal("success"),
});

export const systemAdminMembershipOperation = mutation({
  args: {
    targetUserId: v.id("users"),
    operation: systemAdminMembershipOperationValidator,
    sourceGroupId: v.optional(v.id("groups")),
    targetGroupId: v.optional(v.id("groups")),
    reason: v.string(),
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return await systemAdminMembershipOperationUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      targetUserId: args.targetUserId,
      operation: args.operation,
      sourceGroupId: args.sourceGroupId,
      targetGroupId: args.targetGroupId,
      reason: args.reason,
    });
  },
});
