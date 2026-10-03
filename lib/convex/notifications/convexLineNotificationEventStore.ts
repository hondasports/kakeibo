import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { LineNotificationEventRecord } from "../../domain/notifications/records";
import type { LineNotificationEventStore } from "../../domain/notifications/store";

export function docToLineNotificationEventRecord(
  doc: Doc<"lineNotificationEvents">,
): LineNotificationEventRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    batchId: doc.batchId,
    type: doc.type,
    dedupeKey: doc.dedupeKey,
    outcome: doc.outcome,
    ...(doc.reason === undefined ? {} : { reason: doc.reason }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createLineNotificationEventReader(
  ctx: Pick<QueryCtx, "db">,
): Pick<LineNotificationEventStore, "findByDedupeKey" | "listCreatedBefore"> {
  return {
    async findByDedupeKey(dedupeKey) {
      const doc = await ctx.db
        .query("lineNotificationEvents")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      return doc ? docToLineNotificationEventRecord(doc) : null;
    },
    async listCreatedBefore(cutoff, limit) {
      const docs = await ctx.db
        .query("lineNotificationEvents")
        .withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
        .take(limit);
      return docs.map(docToLineNotificationEventRecord);
    },
  };
}

export function createLineNotificationEventStore(
  ctx: Pick<MutationCtx, "db">,
): LineNotificationEventStore {
  return {
    ...createLineNotificationEventReader(ctx),
    async insert(fields) {
      return await ctx.db.insert("lineNotificationEvents", {
        ...fields,
        batchId: fields.batchId as Id<"receiptAnalysisBatches">,
      });
    },
    async delete(eventId) {
      await ctx.db.delete(eventId as Id<"lineNotificationEvents">);
    },
  };
}
