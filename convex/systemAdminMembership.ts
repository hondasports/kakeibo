import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { createSystemAdminMutationDeps } from "../lib/convex/systemAdmin/systemAdminDeps";
import { systemAdminMembershipOperation as systemAdminMembershipOperationUsecase } from "../lib/usecase/systemAdmin";

const operationValidator = v.union(
  v.literal("add"),
  v.literal("remove"),
  v.literal("transfer"),
  v.literal("set_active"),
  v.literal("clear_active"),
);
const resultValidator = v.object({
  operation: operationValidator,
  status: v.literal("success"),
});

export const systemAdminMembershipOperation = mutation({
  args: {
    targetUserId: v.id("users"),
    operation: operationValidator,
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
