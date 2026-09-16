/**
 * accountDeletion の Convex エンドポイント層（presentation）。
 * 実体は lib/usecase/accountDeletion + lib/convex/accountDeletion アダプタへ分離済み。
 * 既存の直接 import 互換（loadAccountDeletionClassification /
 * deleteOrphanedGroupMemberships / assertAccountDeletionNotInProgress）を維持する。
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAuthenticatedUserId } from "./users/auth";
import {
  createAccountDeletionMutationDeps,
  createAccountDeletionQueryDeps,
} from "../lib/convex/accountDeletion/accountDeletionDeps";
import { createGroupMembershipReadRepository } from "../lib/convex/groups/convexGroupMembershipRepository";
import { createGroupMembershipRepository } from "../lib/convex/groups/convexGroupMembershipRepository";
import { createGroupReadRepository } from "../lib/convex/groups/convexGroupRepository";
import { createAccountDeletionRequestReader } from "../lib/convex/accountDeletion/convexAccountDeletionRequestStore";
import {
  assertAccountDeletionNotInProgress as assertAccountDeletionNotInProgressUsecase,
  deleteOrphanedGroupMemberships as deleteOrphanedGroupMembershipsUsecase,
  loadAccountDeletionClassification as loadAccountDeletionClassificationUsecase,
} from "../lib/usecase/accountDeletion/classification";
import {
  getAccountDeletionPreview as getAccountDeletionPreviewUsecase,
  getMyAccountDeletionStatus as getMyAccountDeletionStatusUsecase,
} from "../lib/usecase/accountDeletion/queries";
import { requestAccountDeletion as requestAccountDeletionUsecase } from "../lib/usecase/accountDeletion/requestAccountDeletion";
import { retryAccountDeletion as retryAccountDeletionUsecase } from "../lib/usecase/accountDeletion/retryAccountDeletion";
import { resetFailedAccountDeletionPurges as resetFailedAccountDeletionPurgesUsecase } from "../lib/usecase/accountDeletion/resetFailedAccountDeletionPurges";
import { prepareAccountDeletionBatch as prepareAccountDeletionBatchUsecase } from "../lib/usecase/accountDeletion/prepareAccountDeletionBatch";
import { advanceAccountDeletionPurge as advanceAccountDeletionPurgeUsecase } from "../lib/usecase/accountDeletion/advanceAccountDeletionPurge";
import {
  cleanupCompletedAccountDeletionRequests,
  markDeletingIdentity as markDeletingIdentityUsecase,
  markIdentityDeleted as markIdentityDeletedUsecase,
  scheduleAccountDeletionRetry,
} from "../lib/usecase/accountDeletion/requestMutations";
import { finalizeAccountDeletion as finalizeAccountDeletionUsecase } from "../lib/usecase/accountDeletion/finalizeAccountDeletion";

/** テスト・他ドメインからの直接 import 互換シム。 */
export async function loadAccountDeletionClassification(ctx: Pick<QueryCtx, "db">, userId: string) {
  const result = await loadAccountDeletionClassificationUsecase(
    {
      memberships: createGroupMembershipReadRepository(ctx),
      groups: createGroupReadRepository(ctx),
    },
    userId,
  );
  return {
    classification: result.classification,
    // 既存呼び出し側は Convex ドキュメント形状（_id）を期待する。
    orphanMemberships: result.orphanMemberships.map((membership) => ({
      _id: membership.id as Id<"groupMembers">,
      groupId: membership.groupId as Id<"groups">,
      userId: membership.userId,
      role: membership.role,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    })),
  };
}

export async function deleteOrphanedGroupMemberships(
  ctx: Pick<MutationCtx, "db">,
  memberships: Array<{ _id: Id<"groupMembers"> }>,
) {
  await deleteOrphanedGroupMembershipsUsecase(
    { memberships: createGroupMembershipRepository(ctx) },
    memberships.map((membership) => ({ id: membership._id })),
  );
}

export async function assertAccountDeletionNotInProgress(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  await assertAccountDeletionNotInProgressUsecase(
    { requests: createAccountDeletionRequestReader(ctx) },
    userId,
  );
}

export const getAccountDeletionPreview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return await getAccountDeletionPreviewUsecase(createAccountDeletionQueryDeps(ctx), userId);
  },
});

export const getMyAccountDeletionStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return await getMyAccountDeletionStatusUsecase(createAccountDeletionQueryDeps(ctx), userId);
  },
});

export const requestAccountDeletion = mutation({
  args: { confirmationText: v.string() },
  returns: v.id("accountDeletionRequests"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const requestId = await requestAccountDeletionUsecase(createAccountDeletionMutationDeps(ctx), {
      confirmationText: args.confirmationText,
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
    });
    return requestId as Id<"accountDeletionRequests">;
  },
});

export const retryAccountDeletion = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return await retryAccountDeletionUsecase(createAccountDeletionMutationDeps(ctx), {
      userId,
    });
  },
});

export const resetFailedAccountDeletionPurges = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    await resetFailedAccountDeletionPurgesUsecase(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
    });
  },
});

export const prepareAccountDeletionBatch = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    await prepareAccountDeletionBatchUsecase(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
    });
  },
});

export const advanceAccountDeletionPurge = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  returns: v.union(v.literal("waiting"), v.literal("ready"), v.literal("failed")),
  handler: async (ctx, args) =>
    await advanceAccountDeletionPurgeUsecase(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
    }),
});

export const getRequest = internalQuery({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => await createAccountDeletionRequestReader(ctx).get(args.requestId),
});

export const markDeletingIdentity = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) =>
    await markDeletingIdentityUsecase(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
    }),
});

export const markIdentityDeleted = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) =>
    await markIdentityDeletedUsecase(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
    }),
});

export const scheduleRetry = internalMutation({
  args: {
    requestId: v.id("accountDeletionRequests"),
    code: v.string(),
    message: v.string(),
    finalization: v.boolean(),
  },
  handler: async (ctx, args) => {
    await scheduleAccountDeletionRetry(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
      code: args.code,
      message: args.message,
      finalization: args.finalization,
    });
  },
});

export const finalizeAccountDeletion = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    await finalizeAccountDeletionUsecase(createAccountDeletionMutationDeps(ctx), {
      requestId: args.requestId,
    });
  },
});

export const cleanupCompletedRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    await cleanupCompletedAccountDeletionRequests(createAccountDeletionMutationDeps(ctx));
  },
});
