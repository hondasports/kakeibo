import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { createSystemAdminMutationDeps } from "../lib/convex/systemAdmin/systemAdminDeps";
import { systemAdminRoleOperation as systemAdminRoleOperationUsecase } from "../lib/usecase/systemAdmin";

const operationValidator = v.union(v.literal("change_role"), v.literal("transfer_owner"));
const roleValidator = v.union(v.literal("owner"), v.literal("member"));

export const systemAdminRoleOperation = mutation({
  args: {
    operation: operationValidator,
    groupId: v.id("groups"),
    targetUserId: v.id("users"),
    sourceOwnerUserId: v.optional(v.id("users")),
    newRole: v.optional(roleValidator),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return await systemAdminRoleOperationUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      operation: args.operation,
      groupId: args.groupId,
      targetUserId: args.targetUserId,
      sourceOwnerUserId: args.sourceOwnerUserId,
      newRole: args.newRole,
      reason: args.reason,
    });
  },
});
