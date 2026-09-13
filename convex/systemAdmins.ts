import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getResolveAppEnvironmentErrorMessage,
  resolveAppEnvironment,
  type AppEnvironment,
} from "../lib/domain/systemAdmin/environment";
import {
  createSystemAdminMutationDeps,
  createSystemAdminQueryDeps,
} from "../lib/convex/systemAdmin/systemAdminDeps";
import {
  bootstrapSystemAdmin as bootstrapSystemAdminUsecase,
  getMySystemAdminContext as getMySystemAdminContextUsecase,
  grantSystemAdmin as grantSystemAdminUsecase,
  listSystemAdminAuditLogs as listSystemAdminAuditLogsUsecase,
  listSystemAdmins as listSystemAdminsUsecase,
  recoverSystemAdmin as recoverSystemAdminUsecase,
  requireSystemAdminActor,
  revokeSystemAdmin as revokeSystemAdminUsecase,
} from "../lib/usecase/systemAdmin";

function getAppEnvironment(expected?: string): AppEnvironment {
  const result = resolveAppEnvironment(process.env.APP_ENV, expected);
  if (!result.success) {
    throw new ConvexError(getResolveAppEnvironmentErrorMessage(result.error));
  }
  return result.environment;
}

const systemAdminStatusValidator = v.union(v.literal("active"), v.literal("revoked"));
const systemAdminAuditActionValidator = v.union(
  v.literal("system_admin_bootstrapped"),
  v.literal("system_admin_granted"),
  v.literal("system_admin_revoked"),
  v.literal("system_admin_recovered"),
  v.literal("system_admin_user_searched"),
  v.literal("system_admin_group_searched"),
  v.literal("system_admin_user_viewed"),
  v.literal("system_admin_group_viewed"),
  v.literal("system_admin_membership_added"),
  v.literal("system_admin_membership_removed"),
  v.literal("system_admin_membership_transferred"),
  v.literal("system_admin_active_group_set"),
  v.literal("system_admin_active_group_cleared"),
  v.literal("system_admin_group_deletion_resumed"),
  v.literal("system_admin_ownerless_group_recovered"),
  v.literal("system_admin_group_role_changed"),
  v.literal("system_admin_group_owner_transferred"),
  v.literal("system_admin_group_invitation_revoked"),
);
const systemAdminContextValidator = v.union(
  v.object({ status: v.literal("active"), environment: v.string(), userId: v.id("users") }),
  v.object({ status: v.literal("revoked"), environment: v.string() }),
  v.object({ status: v.literal("none"), environment: v.string() }),
);
const systemAdminListItemValidator = v.object({
  id: v.id("systemAdmins"),
  targetUserId: v.id("users"),
  status: systemAdminStatusValidator,
  displayName: v.string(),
  email: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  grantedAt: v.number(),
  revokedAt: v.optional(v.number()),
  isSelf: v.boolean(),
});
const systemAdminAuditItemValidator = v.object({
  id: v.id("systemAdminAuditLogs"),
  action: systemAdminAuditActionValidator,
  actorType: v.union(v.literal("system"), v.literal("system_admin")),
  actorUserId: v.optional(v.id("users")),
  actorDisplayName: v.union(v.string(), v.null()),
  targetUserId: v.optional(v.id("users")),
  targetId: v.optional(v.string()),
  targetDisplayName: v.optional(v.string()),
  sourceUserId: v.optional(v.id("users")),
  sourceUserDisplayName: v.optional(v.string()),
  reason: v.optional(v.string()),
  queryHash: v.optional(v.string()),
  resultCount: v.optional(v.number()),
  result: v.union(v.literal("success"), v.literal("denied")),
  previousStatus: v.optional(systemAdminStatusValidator),
  newStatus: v.optional(systemAdminStatusValidator),
  sourceGroupId: v.optional(v.id("groups")),
  sourceGroupNameSnapshot: v.optional(v.string()),
  targetGroupId: v.optional(v.id("groups")),
  targetGroupNameSnapshot: v.optional(v.string()),
  beforeMembershipStatus: v.optional(
    v.union(v.literal("none"), v.literal("member"), v.literal("owner")),
  ),
  afterMembershipStatus: v.optional(
    v.union(v.literal("none"), v.literal("member"), v.literal("owner")),
  ),
  beforeActiveGroupId: v.optional(v.id("groups")),
  afterActiveGroupId: v.optional(v.id("groups")),
  beforeOwnerCount: v.optional(v.number()),
  afterOwnerCount: v.optional(v.number()),
  createdAt: v.number(),
});
const listSystemAdminsResultValidator = v.object({
  ...paginationResultValidator(systemAdminListItemValidator).fields,
  hasAnotherActiveAdmin: v.boolean(),
});
const listAuditLogsResultValidator = v.object({
  ...paginationResultValidator(systemAdminAuditItemValidator).fields,
});

type DbCtx = Pick<QueryCtx, "db" | "auth"> | Pick<MutationCtx, "db" | "auth">;

/**
 * システム管理者認可ゲート（互換シム）。
 * 旧実装の返却 shape（identity/user Doc/admin Doc）を維持する。
 */
export async function requireSystemAdmin(ctx: DbCtx): Promise<{
  identity: { tokenIdentifier: string };
  user: Doc<"users">;
  admin: Doc<"systemAdmins">;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("システム管理者権限が必要です");
  const actor = await requireSystemAdminActor(
    createSystemAdminQueryDeps(ctx),
    identity.tokenIdentifier,
  );
  return {
    identity,
    user: { ...actor.user, _id: actor.user.docId } as unknown as Doc<"users">,
    admin: { ...actor.admin, _id: actor.admin.id } as unknown as Doc<"systemAdmins">,
  };
}

export const getMySystemAdminContext = query({
  args: {},
  returns: systemAdminContextValidator,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const environment = getAppEnvironment();
    return (await getMySystemAdminContextUsecase(createSystemAdminQueryDeps(ctx), {
      tokenIdentifier: identity?.tokenIdentifier ?? null,
      environment,
    })) as
      | { status: "active"; environment: AppEnvironment; userId: Id<"users"> }
      | { status: "revoked"; environment: AppEnvironment }
      | { status: "none"; environment: AppEnvironment };
  },
});

export const listSystemAdmins = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
  },
  returns: listSystemAdminsResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return (await listSystemAdminsUsecase(createSystemAdminQueryDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      paginationOpts: args.paginationOpts,
      status: args.status,
    })) as Infer<typeof listSystemAdminsResultValidator>;
  },
});

export const listSystemAdminAuditLogs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    action: v.optional(systemAdminAuditActionValidator),
    actorUserId: v.optional(v.id("users")),
    targetUserId: v.optional(v.id("users")),
  },
  returns: listAuditLogsResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return (await listSystemAdminAuditLogsUsecase(createSystemAdminQueryDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      paginationOpts: args.paginationOpts,
      from: args.from,
      to: args.to,
      action: args.action,
      actorUserId: args.actorUserId,
      targetUserId: args.targetUserId,
    })) as Infer<typeof listAuditLogsResultValidator>;
  },
});

export const grantSystemAdmin = mutation({
  args: { targetUserId: v.id("users"), reason: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return await grantSystemAdminUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      targetUserId: args.targetUserId,
      reason: args.reason,
      environment: getAppEnvironment(),
    });
  },
});

export const revokeSystemAdmin = mutation({
  args: { targetUserId: v.id("users"), reason: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return await revokeSystemAdminUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      targetUserId: args.targetUserId,
      reason: args.reason,
      environment: getAppEnvironment(),
    });
  },
});

export const bootstrapSystemAdmin = internalMutation({
  args: {
    targetUserId: v.id("users"),
    reason: v.string(),
    expectedEnvironment: v.string(),
  },
  handler: async (ctx, args) => {
    const environment = getAppEnvironment(args.expectedEnvironment);
    return await bootstrapSystemAdminUsecase(createSystemAdminMutationDeps(ctx), {
      targetUserId: args.targetUserId,
      reason: args.reason,
      environment,
    });
  },
});

export const recoverSystemAdmin = internalMutation({
  args: {
    targetUserId: v.id("users"),
    reason: v.string(),
    expectedEnvironment: v.string(),
  },
  handler: async (ctx, args) => {
    const environment = getAppEnvironment(args.expectedEnvironment);
    return await recoverSystemAdminUsecase(createSystemAdminMutationDeps(ctx), {
      targetUserId: args.targetUserId,
      reason: args.reason,
      environment,
    });
  },
});
