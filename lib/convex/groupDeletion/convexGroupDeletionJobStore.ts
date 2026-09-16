/**
 * GroupDeletionJobStore の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  GroupDeletionJobReader,
  GroupDeletionJobRecord,
} from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionJobStore } from "../../domain/groupDeletion/groupDeletionJobStore";

export function groupDeletionJobDocToRecord(doc: Doc<"groupDeletionJobs">): GroupDeletionJobRecord {
  return {
    id: doc._id,
    targetGroupIdSnapshot: doc.targetGroupIdSnapshot,
    targetGroupNameSnapshot: doc.targetGroupNameSnapshot,
    source: doc.source,
    actorUserIdSnapshot: doc.actorUserIdSnapshot,
    status: doc.status,
    stage: doc.stage,
    isActive: doc.isActive,
    attemptCount: doc.attemptCount,
    maxAttempts: doc.maxAttempts,
    nextRetryAt: doc.nextRetryAt,
    lastErrorCategory: doc.lastErrorCategory,
    snapshotCursor: doc.snapshotCursor,
    failureNotificationHandledAt: doc.failureNotificationHandledAt,
    failureNotificationAttemptCount: doc.failureNotificationAttemptCount,
    deletedCounts: doc.deletedCounts,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt,
  };
}

/** 読み取り専用コンテキスト（query）向けのジョブ参照。 */
export function createGroupDeletionJobReader(ctx: Pick<QueryCtx, "db">): GroupDeletionJobReader {
  return {
    async get(jobId) {
      const doc = await ctx.db.get(jobId as Id<"groupDeletionJobs">);
      return doc === null ? null : groupDeletionJobDocToRecord(doc);
    },
    async paginate(filter, opts) {
      const page = filter.status
        ? await ctx.db
            .query("groupDeletionJobs")
            .withIndex("by_status_and_updated_at", (q) => q.eq("status", filter.status!))
            .order("desc")
            .paginate(opts)
        : await ctx.db
            .query("groupDeletionJobs")
            .withIndex("by_updated_at")
            .order("desc")
            .paginate(opts);
      return { ...page, page: page.page.map(groupDeletionJobDocToRecord) };
    },
  };
}

export function createGroupDeletionJobStore(ctx: Pick<MutationCtx, "db">): GroupDeletionJobStore {
  return {
    async get(jobId) {
      const doc = await ctx.db.get(jobId as Id<"groupDeletionJobs">);
      return doc === null ? null : groupDeletionJobDocToRecord(doc);
    },
    async paginate(filter, opts) {
      const page = filter.status
        ? await ctx.db
            .query("groupDeletionJobs")
            .withIndex("by_status_and_updated_at", (q) => q.eq("status", filter.status!))
            .order("desc")
            .paginate(opts)
        : await ctx.db
            .query("groupDeletionJobs")
            .withIndex("by_updated_at")
            .order("desc")
            .paginate(opts);
      return { ...page, page: page.page.map(groupDeletionJobDocToRecord) };
    },
    async insert(fields) {
      return await ctx.db.insert(
        "groupDeletionJobs",
        fields as Omit<Doc<"groupDeletionJobs">, "_id" | "_creationTime">,
      );
    },
    async patch(jobId, fields) {
      await ctx.db.patch(
        jobId as Id<"groupDeletionJobs">,
        fields as Partial<Doc<"groupDeletionJobs">>,
      );
    },
    async findActiveByTargetSnapshot(targetGroupIdSnapshot) {
      const docs = await ctx.db
        .query("groupDeletionJobs")
        .withIndex("by_target_group_id_snapshot_and_is_active", (q) =>
          q.eq("targetGroupIdSnapshot", targetGroupIdSnapshot).eq("isActive", true),
        )
        .take(1);
      const doc = docs[0];
      return doc === undefined ? null : groupDeletionJobDocToRecord(doc);
    },
    resolveGroupId(targetGroupIdSnapshot) {
      return ctx.db.normalizeId("groups", targetGroupIdSnapshot);
    },
  };
}
