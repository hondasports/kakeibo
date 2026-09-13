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
import { createDeleteTestEmailRecordsDeps } from "../../lib/convex/email/emailDeps";

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
    status: v.union(v.literal("failed"), v.literal("suppressed")),
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
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("complained"),
      v.literal("suppressed"),
      v.literal("failed"),
    ),
    lastProviderEventAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await createEmailJobStore(ctx).updateJobStatusFromWebhook(args);
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
