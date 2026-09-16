import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { TransactionalEmailJobRecord } from "../../domain/email/records";
import type {
  MarkJobRetryingFields,
  MarkJobSentFields,
  MarkJobTerminalFields,
  TransactionalEmailJobReader,
  TransactionalEmailJobStore,
  UpdateJobStatusFromWebhookFields,
} from "../../domain/email/store";
import type {
  NewTransactionalEmailJobFields,
  TerminalEmailJobStatus,
} from "../../domain/email/rules";

export const getEmailJobDocument = (ctx: Pick<QueryCtx, "db">, id: Id<"transactionalEmailJobs">) =>
  ctx.db.get(id);

export const findEmailJobDocByProviderMessageId = (
  ctx: Pick<QueryCtx, "db">,
  providerMessageId: string,
) =>
  ctx.db
    .query("transactionalEmailJobs")
    .withIndex("by_provider_message_id", (q) => q.eq("providerMessageId", providerMessageId))
    .unique();

export function toEmailJobRecord(doc: Doc<"transactionalEmailJobs">): TransactionalEmailJobRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    templateType: doc.templateType,
    payloadJson: doc.payloadJson,
    recipientEmail: doc.recipientEmail,
    normalizedRecipientEmail: doc.normalizedRecipientEmail,
    subject: doc.subject,
    ...(doc.businessDedupeKey === undefined ? {} : { businessDedupeKey: doc.businessDedupeKey }),
    ...(doc.html === undefined ? {} : { html: doc.html }),
    ...(doc.text === undefined ? {} : { text: doc.text }),
    provider: doc.provider,
    status: doc.status,
    ...(doc.providerMessageId === undefined ? {} : { providerMessageId: doc.providerMessageId }),
    ...(doc.lastProviderEventAt === undefined
      ? {}
      : { lastProviderEventAt: doc.lastProviderEventAt }),
    attemptCount: doc.attemptCount,
    maxAttempts: doc.maxAttempts,
    ...(doc.nextRetryAt === undefined ? {} : { nextRetryAt: doc.nextRetryAt }),
    ...(doc.errorMessage === undefined ? {} : { errorMessage: doc.errorMessage }),
    ...(doc.errorCode === undefined ? {} : { errorCode: doc.errorCode }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createEmailJobReader(ctx: Pick<QueryCtx, "db">): TransactionalEmailJobReader {
  return {
    async getJob(jobId) {
      const doc = await ctx.db.get(jobId as Id<"transactionalEmailJobs">);
      return doc ? toEmailJobRecord(doc) : null;
    },
    async findJobByBusinessDedupeKey(key) {
      const doc = await ctx.db
        .query("transactionalEmailJobs")
        .withIndex("by_business_dedupe_key", (q) => q.eq("businessDedupeKey", key))
        .unique();
      return doc ? toEmailJobRecord(doc) : null;
    },
    async findJobByProviderMessageId(providerMessageId) {
      const doc = await ctx.db
        .query("transactionalEmailJobs")
        .withIndex("by_provider_message_id", (q) => q.eq("providerMessageId", providerMessageId))
        .unique();
      return doc ? toEmailJobRecord(doc) : null;
    },
    async listJobsByNormalizedRecipient(normalizedEmail) {
      const docs = await ctx.db
        .query("transactionalEmailJobs")
        .withIndex("by_normalized_recipient_email", (q) =>
          q.eq("normalizedRecipientEmail", normalizedEmail),
        )
        .collect();
      return docs.map(toEmailJobRecord);
    },
    async listTerminalJobsUpdatedBefore(status: TerminalEmailJobStatus, cutoff, limit) {
      const docs = await ctx.db
        .query("transactionalEmailJobs")
        .withIndex("by_status_and_updated_at", (q) =>
          q.eq("status", status).lt("updatedAt", cutoff),
        )
        .take(limit);
      return docs.map(toEmailJobRecord);
    },
  };
}

export function createEmailJobStore(ctx: Pick<MutationCtx, "db">): TransactionalEmailJobStore {
  return {
    ...createEmailJobReader(ctx),
    async insertJob(fields: NewTransactionalEmailJobFields) {
      return await ctx.db.insert("transactionalEmailJobs", fields);
    },
    async markJobSent(args: MarkJobSentFields) {
      await ctx.db.patch(args.jobId as Id<"transactionalEmailJobs">, {
        providerMessageId: args.providerMessageId,
        status: args.status,
        html: args.html,
        text: args.text,
        updatedAt: args.updatedAt,
        nextRetryAt: undefined,
        errorMessage: undefined,
        errorCode: undefined,
      });
    },
    async markJobRetrying(args: MarkJobRetryingFields) {
      await ctx.db.patch(args.jobId as Id<"transactionalEmailJobs">, {
        status: args.status,
        attemptCount: args.attemptCount,
        nextRetryAt: args.nextRetryAt,
        errorMessage: args.errorMessage,
        errorCode: args.errorCode,
        updatedAt: args.updatedAt,
      });
    },
    async markJobTerminal(args: MarkJobTerminalFields) {
      await ctx.db.patch(args.jobId as Id<"transactionalEmailJobs">, {
        status: args.status,
        errorMessage: args.errorMessage,
        errorCode: args.errorCode,
        nextRetryAt: undefined,
        updatedAt: args.updatedAt,
      });
    },
    async updateJobStatusFromWebhook(args: UpdateJobStatusFromWebhookFields) {
      await ctx.db.patch(args.jobId as Id<"transactionalEmailJobs">, {
        status: args.status,
        lastProviderEventAt: args.lastProviderEventAt,
        updatedAt: args.updatedAt,
      });
    },
    async deleteJob(id) {
      await ctx.db.delete(id as Id<"transactionalEmailJobs">);
    },
  };
}
