import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import { deleteDraftAndItems } from "../aiExpenseDrafts/draftRepository";
import type {
  ReceiptAnalysisBatchRecord,
  ReceiptAnalysisJobRecord,
} from "../../domain/receiptAnalysisJobs/records";
import type {
  ReceiptAnalysisReader,
  ReceiptAnalysisStore,
} from "../../domain/receiptAnalysisJobs/store";

export const getReceiptAnalysisBatchDocument = (
  ctx: Pick<QueryCtx, "db">,
  id: Id<"receiptAnalysisBatches">,
) => ctx.db.get(id);

export const getReceiptAnalysisJobDocument = (
  ctx: Pick<QueryCtx, "db">,
  id: Id<"receiptAnalysisImageJobs">,
) => ctx.db.get(id);

export function toBatchRecord(doc: Doc<"receiptAnalysisBatches">): ReceiptAnalysisBatchRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    groupId: doc.groupId,
    ...(doc.createdByUserId === undefined ? {} : { createdByUserId: doc.createdByUserId }),
    totalCount: doc.totalCount,
    processedCount: doc.processedCount,
    status: doc.status,
    ...(doc.aiReviewNotificationScheduledAt === undefined
      ? {}
      : { aiReviewNotificationScheduledAt: doc.aiReviewNotificationScheduledAt }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toJobRecord(doc: Doc<"receiptAnalysisImageJobs">): ReceiptAnalysisJobRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    batchId: doc.batchId,
    groupId: doc.groupId,
    imageIndex: doc.imageIndex,
    fileName: doc.fileName,
    status: doc.status,
    ...(doc.draftId === undefined ? {} : { draftId: doc.draftId }),
    ...(doc.error === undefined ? {} : { error: doc.error }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function batchRecordToDoc(
  record: ReceiptAnalysisBatchRecord,
): Doc<"receiptAnalysisBatches"> {
  const { id, creationTime, groupId, ...fields } = record;
  return {
    _id: id as Id<"receiptAnalysisBatches">,
    _creationTime: creationTime,
    groupId: groupId as Id<"groups">,
    ...fields,
  };
}

export function jobRecordToDoc(record: ReceiptAnalysisJobRecord): Doc<"receiptAnalysisImageJobs"> {
  const { id, creationTime, batchId, groupId, draftId, ...fields } = record;
  return {
    _id: id as Id<"receiptAnalysisImageJobs">,
    _creationTime: creationTime,
    batchId: batchId as Id<"receiptAnalysisBatches">,
    groupId: groupId as Id<"groups">,
    ...(draftId === undefined ? {} : { draftId: draftId as Id<"aiExpenseDrafts"> }),
    ...fields,
  };
}

export function createReceiptAnalysisStore(ctx: Pick<MutationCtx, "db">): ReceiptAnalysisStore {
  return {
    async getBatch(id) {
      const doc = await ctx.db.get(id as Id<"receiptAnalysisBatches">);
      return doc === null ? null : toBatchRecord(doc);
    },
    async insertBatch(fields) {
      const { groupId, ...rest } = fields;
      return await ctx.db.insert("receiptAnalysisBatches", {
        ...rest,
        groupId: groupId as Id<"groups">,
      });
    },
    async patchBatch(id, fields) {
      const { groupId, ...rest } = fields;
      await ctx.db.patch(id as Id<"receiptAnalysisBatches">, {
        ...rest,
        ...(groupId === undefined ? {} : { groupId: groupId as Id<"groups"> }),
      });
    },
    async listBatchesByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("receiptAnalysisBatches")
        .withIndex("by_group_id_and_created_at", (q) => q.eq("groupId", groupId as Id<"groups">))
        .order("desc")
        .take(limit);
      return docs.map(toBatchRecord);
    },
    async takeBatchesByGroupAndUser(groupId, userId, limit) {
      const docs = await ctx.db
        .query("receiptAnalysisBatches")
        .withIndex("by_group_id_and_created_by_user_id", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("createdByUserId", userId),
        )
        .order("asc")
        .take(limit);
      return docs.map(toBatchRecord);
    },
    async deleteBatch(id) {
      await ctx.db.delete(id as Id<"receiptAnalysisBatches">);
    },
    async getJob(id) {
      const doc = await ctx.db.get(id as Id<"receiptAnalysisImageJobs">);
      return doc === null ? null : toJobRecord(doc);
    },
    async insertJob(fields) {
      const { batchId, groupId, draftId, ...rest } = fields;
      return await ctx.db.insert("receiptAnalysisImageJobs", {
        ...rest,
        batchId: batchId as Id<"receiptAnalysisBatches">,
        groupId: groupId as Id<"groups">,
        ...(draftId === undefined ? {} : { draftId: draftId as Id<"aiExpenseDrafts"> }),
      });
    },
    async patchJob(id, fields) {
      const { draftId, ...rest } = fields;
      await ctx.db.patch(id as Id<"receiptAnalysisImageJobs">, {
        ...rest,
        ...(draftId === undefined ? {} : { draftId: draftId as Id<"aiExpenseDrafts"> }),
      });
    },
    async clearJobFields(id, fields) {
      const { clearDraftId, clearError, draftId, ...rest } = fields;
      await ctx.db.patch(id as Id<"receiptAnalysisImageJobs">, {
        ...rest,
        ...(clearDraftId
          ? { draftId: undefined }
          : draftId === undefined
            ? {}
            : { draftId: draftId as Id<"aiExpenseDrafts"> }),
        ...(clearError ? { error: undefined } : {}),
      });
    },
    async listJobsByBatch(batchId, limit) {
      const query = ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_batch_id", (q) => q.eq("batchId", batchId as Id<"receiptAnalysisBatches">))
        .order("asc");
      const docs = limit === undefined ? await query.collect() : await query.take(limit);
      return docs.map(toJobRecord);
    },
    async listJobsByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_group_id_and_status", (q) => q.eq("groupId", groupId as Id<"groups">))
        .order("desc")
        .take(limit);
      return docs.map(toJobRecord);
    },
    async findJobByDraftId(draftId) {
      const doc = await ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_draft_id", (q) => q.eq("draftId", draftId as Id<"aiExpenseDrafts">))
        .unique();
      return doc === null ? null : toJobRecord(doc);
    },
    async deleteJob(id) {
      await ctx.db.delete(id as Id<"receiptAnalysisImageJobs">);
    },
    async countJobsByStatus(batchId, status) {
      const docs = await ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_batch_id", (q) => q.eq("batchId", batchId as Id<"receiptAnalysisBatches">))
        .collect();
      return docs.filter((job) => job.status === status).length;
    },
    async getDraft(id) {
      const doc = await ctx.db.get(id as Id<"aiExpenseDrafts">);
      return doc === null ? null : { id: doc._id, status: doc.status, updatedAt: doc.updatedAt };
    },
    deleteDraftAndItems: (draftId, groupId) =>
      deleteDraftAndItems(
        ctx as MutationCtx,
        draftId as Id<"aiExpenseDrafts">,
        groupId as Id<"groups">,
      ),
  };
}

export function createReceiptAnalysisReader(ctx: Pick<QueryCtx, "db">): ReceiptAnalysisReader {
  return {
    async getBatch(id) {
      const doc = await ctx.db.get(id as Id<"receiptAnalysisBatches">);
      return doc === null ? null : toBatchRecord(doc);
    },
    async listBatchesByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("receiptAnalysisBatches")
        .withIndex("by_group_id_and_created_at", (q) => q.eq("groupId", groupId as Id<"groups">))
        .order("desc")
        .take(limit);
      return docs.map(toBatchRecord);
    },
    async getJob(id) {
      const doc = await ctx.db.get(id as Id<"receiptAnalysisImageJobs">);
      return doc === null ? null : toJobRecord(doc);
    },
    async listJobsByBatch(batchId, limit) {
      const query = ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_batch_id", (q) => q.eq("batchId", batchId as Id<"receiptAnalysisBatches">))
        .order("asc");
      const docs = limit === undefined ? await query.collect() : await query.take(limit);
      return docs.map(toJobRecord);
    },
    async listJobsByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_group_id_and_status", (q) => q.eq("groupId", groupId as Id<"groups">))
        .order("desc")
        .take(limit);
      return docs.map(toJobRecord);
    },
    async findJobByDraftId(draftId) {
      const doc = await ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_draft_id", (q) => q.eq("draftId", draftId as Id<"aiExpenseDrafts">))
        .unique();
      return doc === null ? null : toJobRecord(doc);
    },
    async countJobsByStatus(batchId, status) {
      const docs = await ctx.db
        .query("receiptAnalysisImageJobs")
        .withIndex("by_batch_id", (q) => q.eq("batchId", batchId as Id<"receiptAnalysisBatches">))
        .collect();
      return docs.filter((job) => job.status === status).length;
    },
  };
}
