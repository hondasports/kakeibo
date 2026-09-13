import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { EmailWebhookEventRecord } from "../../domain/email/records";
import type { EmailWebhookEventReader, EmailWebhookEventStore } from "../../domain/email/store";

export const getEmailEventDocBySvixId = (ctx: Pick<QueryCtx, "db">, svixId: string) =>
  ctx.db
    .query("emailWebhookEvents")
    .withIndex("by_svix_id", (q) => q.eq("svixId", svixId))
    .unique();

export const findLatestEmailEventDocForProviderMessageId = (
  ctx: Pick<QueryCtx, "db">,
  providerMessageId: string,
) =>
  ctx.db
    .query("emailWebhookEvents")
    .withIndex("by_provider_message_id_and_event_created_at", (q) =>
      q.eq("providerMessageId", providerMessageId),
    )
    .order("desc")
    .take(1)
    .then((events) => events[0] ?? null);

export function toEmailWebhookEventRecord(doc: Doc<"emailWebhookEvents">): EmailWebhookEventRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    svixId: doc.svixId,
    provider: doc.provider,
    eventType: doc.eventType,
    ...(doc.providerMessageId === undefined ? {} : { providerMessageId: doc.providerMessageId }),
    ...(doc.recipientEmail === undefined ? {} : { recipientEmail: doc.recipientEmail }),
    payloadJson: doc.payloadJson,
    ...(doc.eventCreatedAt === undefined ? {} : { eventCreatedAt: doc.eventCreatedAt }),
    processedAt: doc.processedAt,
    createdAt: doc.createdAt,
  };
}

export function createEmailWebhookEventReader(ctx: Pick<QueryCtx, "db">): EmailWebhookEventReader {
  return {
    async findEventBySvixId(svixId) {
      const doc = await ctx.db
        .query("emailWebhookEvents")
        .withIndex("by_svix_id", (q) => q.eq("svixId", svixId))
        .unique();
      return doc ? toEmailWebhookEventRecord(doc) : null;
    },
    async findLatestEventForProviderMessageId(providerMessageId) {
      const events = await ctx.db
        .query("emailWebhookEvents")
        .withIndex("by_provider_message_id_and_event_created_at", (q) =>
          q.eq("providerMessageId", providerMessageId),
        )
        .order("desc")
        .take(1);
      const doc = events[0];
      return doc ? toEmailWebhookEventRecord(doc) : null;
    },
    async listEventsProcessedBefore(cutoff, limit) {
      const docs = await ctx.db
        .query("emailWebhookEvents")
        .withIndex("by_processed_at", (q) => q.lt("processedAt", cutoff))
        .take(limit);
      return docs.map(toEmailWebhookEventRecord);
    },
    async listEventsByProviderMessageId(providerMessageId) {
      const docs = await ctx.db
        .query("emailWebhookEvents")
        .withIndex("by_provider_message_id_and_event_created_at", (q) =>
          q.eq("providerMessageId", providerMessageId),
        )
        .collect();
      return docs.map(toEmailWebhookEventRecord);
    },
  };
}

export function createEmailWebhookEventStore(ctx: Pick<MutationCtx, "db">): EmailWebhookEventStore {
  return {
    ...createEmailWebhookEventReader(ctx),
    async insertEvent(fields) {
      return await ctx.db.insert("emailWebhookEvents", fields);
    },
    async deleteEvent(id) {
      await ctx.db.delete(id as Id<"emailWebhookEvents">);
    },
  };
}
