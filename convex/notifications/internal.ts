import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { transactionalEmailTypeValidator } from "../email/model";
import {
  createAiReviewEnqueueDeps,
  createEmailDeliveryDecisionDeps,
  createLineNotificationClaimDeps,
  createLineNotificationCompletionDeps,
  createStaleLineNotificationRecoveryDeps,
} from "../../lib/convex/notifications/notificationDeps";
import { getEmailDeliveryDecision as getEmailDeliveryDecisionUsecase } from "../../lib/usecase/notifications/deliveryDecision";
import { enqueueAiReviewNotifications as enqueueAiReviewNotificationsUsecase } from "../../lib/usecase/notifications/enqueueAiReview";
import {
  authorizeLineNotificationSend as authorizeLineNotificationSendUsecase,
  claimLineNotificationJob as claimLineNotificationJobUsecase,
  completeLineNotificationJob as completeLineNotificationJobUsecase,
  recoverLineNotificationLease as recoverLineNotificationLeaseUsecase,
  recoverStaleLineNotificationJobs as recoverStaleLineNotificationJobsUsecase,
} from "../../lib/usecase/notifications/lineJobLifecycle";
import { docToLineNotificationJobRecord } from "../../lib/convex/notifications/convexLineNotificationJobStore";
import { createLineNotificationScheduler } from "../../lib/convex/notifications/convexNotificationScheduler";
import type { Id } from "../_generated/dataModel";

export const getEmailDeliveryDecision = internalQuery({
  args: {
    type: transactionalEmailTypeValidator,
    userId: v.optional(v.string()),
  },
  returns: v.object({
    enabled: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    return await getEmailDeliveryDecisionUsecase(createEmailDeliveryDecisionDeps(ctx), args);
  },
});

export const enqueueAiReviewNotifications = internalMutation({
  args: {
    batchId: v.id("receiptAnalysisBatches"),
    userId: v.string(),
    pendingCount: v.number(),
  },
  handler: async (ctx, args) => {
    await enqueueAiReviewNotificationsUsecase(createAiReviewEnqueueDeps(ctx), args);
  },
});

const lineNotificationCompletionValidator = v.union(
  v.object({
    outcome: v.literal("sent"),
    providerRequestId: v.optional(v.string()),
  }),
  v.object({
    outcome: v.literal("retrying"),
    nextRetryAt: v.number(),
    errorCode: v.optional(v.string()),
  }),
  v.object({
    outcome: v.literal("failed"),
    errorCode: v.optional(v.string()),
  }),
  v.object({
    outcome: v.literal("suppressed"),
    errorCode: v.optional(v.string()),
  }),
);

export const claimLineNotificationJob = internalMutation({
  args: {
    jobId: v.id("lineNotificationJobs"),
    retryKeyCandidate: v.string(),
    leaseMs: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await claimLineNotificationJobUsecase(createLineNotificationClaimDeps(ctx), {
      jobId: args.jobId,
      retryKeyCandidate: args.retryKeyCandidate,
      leaseMs: args.leaseMs,
      now: args.now,
    });
    if (!result.claimed) return { claimed: false };
    const doc = await ctx.db.get(args.jobId);
    if (!doc) return { claimed: false };
    return { claimed: true, job: docToLineNotificationJobRecord(doc) };
  },
});

export const authorizeLineNotificationSend = internalMutation({
  args: {
    jobId: v.id("lineNotificationJobs"),
    attemptCount: v.number(),
    retryKey: v.string(),
    leaseMs: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await authorizeLineNotificationSendUsecase(
      createLineNotificationClaimDeps(ctx),
      {
        jobId: args.jobId,
        attemptCount: args.attemptCount,
        retryKey: args.retryKey,
        leaseMs: args.leaseMs,
        now: args.now,
      },
    );
    if (!result.claimed) return { claimed: false };
    const doc = await ctx.db.get(args.jobId);
    if (!doc) return { claimed: false };
    return { claimed: true, job: docToLineNotificationJobRecord(doc) };
  },
});

export const completeLineNotificationJob = internalMutation({
  args: {
    jobId: v.id("lineNotificationJobs"),
    attemptCount: v.number(),
    completion: lineNotificationCompletionValidator,
    now: v.number(),
  },
  handler: async (ctx, args) => {
    await completeLineNotificationJobUsecase(createLineNotificationCompletionDeps(ctx), args);
  },
});

export const recoverLineNotificationLease = internalMutation({
  args: {
    jobId: v.id("lineNotificationJobs"),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    await recoverLineNotificationLeaseUsecase(
      {
        jobs: createLineNotificationCompletionDeps(ctx).jobs,
        scheduler: createLineNotificationScheduler(ctx),
      },
      args,
      Date.now(),
    );
  },
});

export const recoverStaleLineNotificationJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    await recoverStaleLineNotificationJobsUsecase(createStaleLineNotificationRecoveryDeps(ctx));
  },
});

export const clearE2eNotificationDataForUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    let deletedCount = 0;
    const jobs = await ctx.db
      .query("lineNotificationJobs")
      .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
      .take(100);
    for (const job of jobs) {
      await ctx.db.delete(job._id);
      deletedCount += 1;
    }
    const events = await ctx.db
      .query("lineNotificationEvents")
      .withIndex("by_user_id_and_created_at", (q) => q.eq("userId", userId))
      .take(100);
    for (const event of events) {
      await ctx.db.delete(event._id);
      deletedCount += 1;
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) => q.eq("userId", userId))
      .unique();
    if (user?.notificationPreferences !== undefined) {
      await ctx.db.patch(user._id as Id<"users">, {
        notificationPreferences: undefined,
        updatedAt: Date.now(),
      });
    }
    return { deletedCount, hasMore: jobs.length >= 100 || events.length >= 100 };
  },
});
