/**
 * LineImageJobStore の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { LineImageJobRecord } from "../../domain/lineWebhook/records";
import type { LineImageJobReader, LineImageJobStore } from "../../domain/lineWebhook/imageJobStore";

function toRecord(doc: Doc<"lineImageJobs">): LineImageJobRecord {
  return {
    id: doc._id,
    webhookEventId: doc.webhookEventId,
    userId: doc.userId,
    messageId: doc.messageId,
    status: doc.status,
    ...(doc.skipReason === undefined ? {} : { skipReason: doc.skipReason }),
    ...(doc.draftId === undefined ? {} : { draftId: doc.draftId }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createLineImageJobReader(ctx: Pick<QueryCtx, "db">): LineImageJobReader {
  return {
    async findByWebhookEventId(webhookEventId) {
      const doc = await ctx.db
        .query("lineImageJobs")
        .withIndex("by_webhook_event_id", (q) => q.eq("webhookEventId", webhookEventId))
        .unique();
      return doc === null ? null : toRecord(doc);
    },
  };
}

export function createLineImageJobStore(ctx: Pick<MutationCtx, "db">): LineImageJobStore {
  return {
    ...createLineImageJobReader(ctx),
    async insert(fields) {
      const { draftId, ...rest } = fields;
      await ctx.db.insert("lineImageJobs", {
        ...rest,
        ...(draftId === undefined ? {} : { draftId: draftId as Id<"aiExpenseDrafts"> }),
      });
    },
    async patch(jobId, fields) {
      const { draftId, ...rest } = fields;
      await ctx.db.patch(jobId as Id<"lineImageJobs">, {
        ...rest,
        ...(draftId === undefined ? {} : { draftId: draftId as Id<"aiExpenseDrafts"> }),
      });
    },
    async takeOlderThan(cutoff, limit) {
      const docs = await ctx.db
        .query("lineImageJobs")
        .withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
        .take(limit);
      return docs.map(toRecord);
    },
    async deleteById(id) {
      await ctx.db.delete(id as Id<"lineImageJobs">);
    },
  };
}
