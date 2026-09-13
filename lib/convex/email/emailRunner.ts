import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../../convex/_generated/server";
import type { EmailJobActionRunner, ResendEventRunner } from "../../domain/email/runner";
import { toEmailJobRecord } from "./convexEmailJobStore";
import { toEmailSuppressionRecord } from "./convexEmailSuppressionStore";
import { toEmailWebhookEventRecord } from "./convexEmailWebhookEventStore";

export function createEmailJobActionRunner(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
): EmailJobActionRunner {
  return {
    async getJob(jobId) {
      const doc = await ctx.runQuery(internal.email.internal.getJobById, {
        jobId: jobId as Id<"transactionalEmailJobs">,
      });
      return doc ? toEmailJobRecord(doc) : null;
    },
    async findSuppression(normalizedEmail) {
      const doc = await ctx.runQuery(internal.email.suppressions.getSuppressionByNormalizedEmail, {
        normalizedEmail,
      });
      return doc ? toEmailSuppressionRecord(doc) : null;
    },
    async markJobSent(args) {
      await ctx.runMutation(internal.email.internal.updateJobForSend, {
        jobId: args.jobId as Id<"transactionalEmailJobs">,
        providerMessageId: args.providerMessageId,
        status: args.status,
        html: args.html,
        text: args.text,
        updatedAt: args.updatedAt,
      });
    },
    async markJobRetrying(args) {
      await ctx.runMutation(internal.email.internal.updateJobForRetry, {
        jobId: args.jobId as Id<"transactionalEmailJobs">,
        status: args.status,
        attemptCount: args.attemptCount,
        nextRetryAt: args.nextRetryAt,
        errorMessage: args.errorMessage,
        errorCode: args.errorCode,
        updatedAt: args.updatedAt,
      });
    },
    async markJobTerminal(args) {
      await ctx.runMutation(internal.email.internal.updateJobForFailure, {
        jobId: args.jobId as Id<"transactionalEmailJobs">,
        status: args.status,
        errorMessage: args.errorMessage,
        errorCode: args.errorCode,
        updatedAt: args.updatedAt,
      });
    },
  };
}

export function createResendEventRunner(
  ctx: Pick<MutationCtx, "runQuery" | "runMutation">,
): ResendEventRunner {
  return {
    async findEventBySvixId(svixId) {
      const doc = await ctx.runQuery(internal.email.internal.getWebhookEventBySvixId, {
        svixId,
      });
      return doc ? toEmailWebhookEventRecord(doc) : null;
    },
    async findJobByProviderMessageId(providerMessageId) {
      const doc = await ctx.runQuery(internal.email.internal.getJobByProviderMessageId, {
        providerMessageId,
      });
      return doc ? toEmailJobRecord(doc) : null;
    },
    async findLatestEventForProviderMessageId(providerMessageId) {
      const doc = await ctx.runQuery(
        internal.email.internal.getLatestWebhookEventForProviderMessageId,
        { providerMessageId },
      );
      return doc ? toEmailWebhookEventRecord(doc) : null;
    },
    async updateJobStatusFromWebhook(args) {
      await ctx.runMutation(internal.email.internal.updateJobStatusFromWebhook, {
        jobId: args.jobId as Id<"transactionalEmailJobs">,
        status: args.status,
        lastProviderEventAt: args.lastProviderEventAt,
        updatedAt: args.updatedAt,
      });
    },
    async upsertSuppression(args) {
      return await ctx.runMutation(internal.email.suppressions.upsertSuppression, {
        email: args.email,
        normalizedEmail: args.normalizedEmail,
        reason: args.reason,
        source: args.source,
        providerMessageId: args.providerMessageId,
        createdAt: args.createdAt,
      });
    },
  };
}
