import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import {
  findEmailJobDocByProviderMessageId,
  getEmailJobDocument,
  createEmailJobStore,
} from "../../lib/convex/email/convexEmailJobStore";
import {
  findLatestEmailEventDocForProviderMessageId,
  getEmailEventDocBySvixId,
} from "../../lib/convex/email/convexEmailWebhookEventStore";
import { deleteTestEmailRecords as deleteTestEmailRecordsUsecase } from "../../lib/usecase/email/deleteTestRecords";
import {
  createDeleteTestEmailRecordsDeps,
  createProcessResendEventDeps,
} from "../../lib/convex/email/emailDeps";
import { reconcileResendEvents } from "../../lib/usecase/email/processResendEvent";
import {
  EMAIL_JOB_FAILURE_STATUSES,
  EMAIL_WEBHOOK_REPORTED_STATUSES,
} from "../../lib/domain/email/model";

export const getJobById = internalQuery({
  args: { jobId: v.id("transactionalEmailJobs") },
  handler: async (ctx, { jobId }) => {
    return await getEmailJobDocument(ctx, jobId);
  },
});

export const getJobByProviderMessageId = internalQuery({
  args: { providerMessageId: v.string() },
  handler: async (ctx, { providerMessageId }) => {
    return await findEmailJobDocByProviderMessageId(ctx, providerMessageId);
  },
});

export const updateJobForSend = internalMutation({
  args: {
    jobId: v.id("transactionalEmailJobs"),
    providerMessageId: v.string(),
    status: v.literal("sent"),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await createEmailJobStore(ctx).markJobSent(args);
    await reconcileResendEvents(createProcessResendEventDeps(ctx), args.providerMessageId);
  },
});

export const updateJobForRetry = internalMutation({
  args: {
    jobId: v.id("transactionalEmailJobs"),
    status: v.literal("retrying"),
    attemptCount: v.number(),
    nextRetryAt: v.number(),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await createEmailJobStore(ctx).markJobRetrying(args);
  },
});

export const updateJobForFailure = internalMutation({
  args: {
    jobId: v.id("transactionalEmailJobs"),
    status: v.union(...EMAIL_JOB_FAILURE_STATUSES.map((status) => v.literal(status))),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await createEmailJobStore(ctx).markJobTerminal(args);
  },
});

export const updateJobStatusFromWebhook = internalMutation({
  args: {
    jobId: v.id("transactionalEmailJobs"),
    status: v.union(...EMAIL_WEBHOOK_REPORTED_STATUSES.map((status) => v.literal(status))),
    lastProviderEventAt: v.number(),
    lastVerifiedProviderEventAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await createEmailJobStore(ctx).updateJobStatusFromWebhook(args);
  },
});

export const refreshLegacyJobRetention = internalMutation({
  args: { jobId: v.id("transactionalEmailJobs"), updatedAt: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) return;
    await ctx.db.patch(args.jobId, { updatedAt: Math.max(job.updatedAt, args.updatedAt) });
  },
});

export const getLatestWebhookEventForProviderMessageId = internalQuery({
  args: { providerMessageId: v.string() },
  handler: async (ctx, { providerMessageId }) => {
    return await findLatestEmailEventDocForProviderMessageId(ctx, providerMessageId);
  },
});

export const deleteTestEmailRecords = internalMutation({
  args: {
    normalizedEmail: v.string(),
  },
  handler: async (ctx, { normalizedEmail }) => {
    return await deleteTestEmailRecordsUsecase(createDeleteTestEmailRecordsDeps(ctx), {
      normalizedEmail,
    });
  },
});

export const getWebhookEventBySvixId = internalQuery({
  args: { svixId: v.string() },
  handler: async (ctx, { svixId }) => {
    return await getEmailEventDocBySvixId(ctx, svixId);
  },
});
