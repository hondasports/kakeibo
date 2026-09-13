import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  createSystemAdminMutationDeps,
  createSystemAdminQueryDeps,
} from "../lib/convex/systemAdmin/systemAdminDeps";
import {
  completePendingInvitation as completePendingInvitationUsecase,
  getPendingInvitationForSystemAdmin as getPendingInvitationForSystemAdminUsecase,
  recordRevokeFailure as recordRevokeFailureUsecase,
} from "../lib/usecase/systemAdmin";

async function requireTokenIdentifier(ctx: Pick<QueryCtx, "auth"> | Pick<MutationCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("システム管理者権限が必要です");
  return identity.tokenIdentifier;
}

export const getPendingInvitationForSystemAdmin = internalQuery({
  args: {
    groupId: v.id("groups"),
    invitationId: v.id("groupInvitations"),
    reason: v.string(),
  },
  returns: v.object({
    groupId: v.id("groups"),
    invitationId: v.id("groupInvitations"),
    groupName: v.string(),
    email: v.string(),
    clerkInvitationId: v.optional(v.string()),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const result = await getPendingInvitationForSystemAdminUsecase(
      createSystemAdminQueryDeps(ctx),
      { tokenIdentifier, ...args },
    );
    return {
      ...result,
      groupId: result.groupId as Id<"groups">,
      invitationId: result.invitationId as Id<"groupInvitations">,
    };
  },
});

export const completePendingInvitation = internalMutation({
  args: {
    groupId: v.id("groups"),
    invitationId: v.id("groupInvitations"),
    reason: v.string(),
    expectedClerkInvitationId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return await completePendingInvitationUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier,
      ...args,
    });
  },
});

export const recordRevokeFailure = internalMutation({
  args: {
    groupId: v.id("groups"),
    invitationId: v.id("groupInvitations"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return await recordRevokeFailureUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier,
      ...args,
    });
  },
});
