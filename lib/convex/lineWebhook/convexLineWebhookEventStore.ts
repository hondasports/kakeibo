/**
 * LineWebhookEventStore の Convex 実装。
 * ctx.db へのクエリ構築・insert/delete をこのアダプタへ隔離する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { LineWebhookEventRecord } from "../../domain/lineWebhook/records";
import type {
  LineWebhookEventReader,
  LineWebhookEventStore,
} from "../../domain/lineWebhook/webhookEventStore";

function toRecord(doc: Doc<"lineWebhookEvents">): LineWebhookEventRecord {
  return {
    id: doc._id,
    webhookEventId: doc.webhookEventId,
    eventType: doc.eventType,
    delivery: doc.delivery,
    ...(doc.userId === undefined ? {} : { userId: doc.userId }),
    ...(doc.messageId === undefined ? {} : { messageId: doc.messageId }),
    ...(doc.messageText === undefined ? {} : { messageText: doc.messageText }),
    ...(doc.postbackData === undefined ? {} : { postbackData: doc.postbackData }),
    ...(doc.eventTimestamp === undefined ? {} : { eventTimestamp: doc.eventTimestamp }),
    createdAt: doc.createdAt,
  };
}

export function createLineWebhookEventReader(ctx: Pick<QueryCtx, "db">): LineWebhookEventReader {
  return {
    async findByWebhookEventId(webhookEventId) {
      const doc = await ctx.db
        .query("lineWebhookEvents")
        .withIndex("by_webhook_event_id", (q) => q.eq("webhookEventId", webhookEventId))
        .first();
      return doc === null ? null : toRecord(doc);
    },
  };
}

export function createLineWebhookEventStore(ctx: Pick<MutationCtx, "db">): LineWebhookEventStore {
  return {
    ...createLineWebhookEventReader(ctx),
    async insert(fields) {
      await ctx.db.insert("lineWebhookEvents", fields);
    },
    async takeOlderThan(cutoff, limit) {
      const docs = await ctx.db
        .query("lineWebhookEvents")
        .withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
        .take(limit);
      return docs.map(toRecord);
    },
    async deleteById(id) {
      await ctx.db.delete(id as Id<"lineWebhookEvents">);
    },
  };
}
