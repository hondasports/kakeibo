import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { LineNotificationJobRecord } from "../../domain/notifications/records";
import type {
  LineNotificationJobReader,
  LineNotificationJobStore,
} from "../../domain/notifications/store";

export function docToLineNotificationJobRecord(
  doc: Doc<"lineNotificationJobs">,
): LineNotificationJobRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    userId: doc.userId,
    batchId: doc.batchId,
    type: doc.type,
    pendingCount: doc.pendingCount,
    linkId: doc.linkId,
    linkedAtSnapshot: doc.linkedAtSnapshot,
    lineUserIdSnapshot: doc.lineUserIdSnapshot,
    text: doc.text,
    status: doc.status,
    attemptCount: doc.attemptCount,
    ...(doc.retryKey === undefined ? {} : { retryKey: doc.retryKey }),
    ...(doc.leaseUntil === undefined ? {} : { leaseUntil: doc.leaseUntil }),
    ...(doc.firstAttemptAt === undefined ? {} : { firstAttemptAt: doc.firstAttemptAt }),
    ...(doc.nextRetryAt === undefined ? {} : { nextRetryAt: doc.nextRetryAt }),
    ...(doc.providerRequestId === undefined ? {} : { providerRequestId: doc.providerRequestId }),
    ...(doc.errorCode === undefined ? {} : { errorCode: doc.errorCode }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createLineNotificationJobReader(
  ctx: Pick<QueryCtx, "db">,
): LineNotificationJobReader {
  return {
    async getJob(jobId) {
      const doc = await ctx.db.get(jobId as Id<"lineNotificationJobs">);
      return doc ? docToLineNotificationJobRecord(doc) : null;
    },
    async findByBatchId(batchId) {
      const doc = await ctx.db
        .query("lineNotificationJobs")
        .withIndex("by_batch_id", (q) => q.eq("batchId", batchId as Id<"receiptAnalysisBatches">))
        .unique();
      return doc ? docToLineNotificationJobRecord(doc) : null;
    },
    async listTerminalJobsUpdatedBefore(status, cutoff, limit) {
      const docs = await ctx.db
        .query("lineNotificationJobs")
        .withIndex("by_status_and_updated_at", (q) =>
          q.eq("status", status).lt("updatedAt", cutoff),
        )
        .take(limit);
      return docs.map(docToLineNotificationJobRecord);
    },
  };
}

export function createLineNotificationJobStore(
  ctx: Pick<MutationCtx, "db">,
): LineNotificationJobStore {
  return {
    ...createLineNotificationJobReader(ctx),
    async insert(fields) {
      return await ctx.db.insert("lineNotificationJobs", {
        ...fields,
        batchId: fields.batchId as Id<"receiptAnalysisBatches">,
        linkId: fields.linkId as Id<"lineAccountLinks">,
      });
    },
    async patch(jobId, fields) {
      await ctx.db.patch(
        jobId as Id<"lineNotificationJobs">,
        fields as Partial<Doc<"lineNotificationJobs">>,
      );
    },
    async delete(jobId) {
      await ctx.db.delete(jobId as Id<"lineNotificationJobs">);
    },
  };
}
