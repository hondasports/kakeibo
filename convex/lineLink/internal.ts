import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { createLineLinkMutationDeps } from "../../lib/convex/lineLink/lineLinkDeps";
import {
  claimLineLinkRequest,
  clearLineLinkE2eDataForUser,
  createLineLinkRequest,
  expireLineLinkRequest,
  expireLineLinkRequests,
  finalizeLineLinkRequest,
  recordFailedLineLinkRequest,
} from "../../lib/usecase/lineLink";

export const createRequest = internalMutation({
  args: {
    userId: v.string(),
    stateHash: v.string(),
    nonceHash: v.string(),
    codeVerifier: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("lineLinkRequests"),
  handler: async (ctx, args) =>
    (await createLineLinkRequest(createLineLinkMutationDeps(ctx), args)) as Id<"lineLinkRequests">,
});

export const claimRequest = internalMutation({
  args: { stateHash: v.string(), userId: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(false), reason: v.string() }),
    v.object({
      ok: v.literal(true),
      requestId: v.id("lineLinkRequests"),
      nonceHash: v.string(),
      codeVerifier: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const result = await claimLineLinkRequest(createLineLinkMutationDeps(ctx), args);
    return result.ok
      ? { ...result, requestId: result.requestId as Id<"lineLinkRequests"> }
      : result;
  },
});

export const finalizeRequest = internalMutation({
  args: {
    requestId: v.id("lineLinkRequests"),
    userId: v.string(),
    lineUserId: v.string(),
    nonceHash: v.string(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: (ctx, args) => finalizeLineLinkRequest(createLineLinkMutationDeps(ctx), args),
});

export const recordFailedRequest = internalMutation({
  args: { requestId: v.id("lineLinkRequests"), userId: v.string(), reasonCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordFailedLineLinkRequest(createLineLinkMutationDeps(ctx), args);
    return null;
  },
});

export const expireRequests = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.object({ expiredCount: v.number() }),
  handler: (ctx, args) => expireLineLinkRequests(createLineLinkMutationDeps(ctx).requests, args),
});

export const expireRequest = internalMutation({
  args: { requestId: v.id("lineLinkRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await expireLineLinkRequest(createLineLinkMutationDeps(ctx).requests, args.requestId);
    return null;
  },
});

export const clearE2eDataForUser = internalMutation({
  args: { userId: v.string() },
  returns: v.object({ deletedCount: v.number(), hasMore: v.boolean() }),
  handler: (ctx, args) => clearLineLinkE2eDataForUser(createLineLinkMutationDeps(ctx), args.userId),
});
