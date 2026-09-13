/**
 * GroupDeletionWorkflowService / GroupDeletionJobReader の Convex 実装。
 * 削除オーケストレーション内部は既存の groupDeletion lib ハンドラへ委譲する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  GroupDeletionJobRecord,
  GroupDeletionJobReader,
} from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionWorkflowService } from "../../domain/groupDeletion/groupDeletionWorkflow";
import { countGroupDeletionImpact } from "../../../convex/groups/lib/groupDeletionImpact";
import { resumeGroupDeletionHandler } from "../../../convex/groups/lib/groupDeletionResume";
import { startGroupDeletionHandler } from "../../../convex/groups/lib/groupDeletionStart";

function jobDocToFields(doc: Doc<"groupDeletionJobs">): GroupDeletionJobRecord {
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
      return doc === null ? null : jobDocToFields(doc);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの影響件数集計。 */
export function createGroupDeletionQueryService(
  ctx: Pick<QueryCtx, "db">,
): Pick<GroupDeletionWorkflowService, "countImpact"> {
  return {
    async countImpact(groupId) {
      return await countGroupDeletionImpact(ctx, groupId as Id<"groups">);
    },
  };
}

export function createGroupDeletionWorkflowService(ctx: MutationCtx): GroupDeletionWorkflowService {
  return {
    async start(args) {
      return await startGroupDeletionHandler(ctx, {
        groupId: args.groupId as Id<"groups">,
        source: args.source,
        actorUserIdSnapshot: args.actorUserIdSnapshot,
      });
    },
    async resume(args) {
      return await resumeGroupDeletionHandler(ctx, {
        jobId: args.jobId as Id<"groupDeletionJobs">,
      });
    },
    async countImpact(groupId) {
      return await countGroupDeletionImpact(ctx, groupId as Id<"groups">);
    },
  };
}
