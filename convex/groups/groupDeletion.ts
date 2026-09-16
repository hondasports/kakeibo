import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  groupDeletionCountsValidator,
  groupDeletionSourceValidator,
  groupDeletionStageValidator,
  groupDeletionStatusValidator,
} from "./lib/groupDeletionJobModel";
import { processGroupDeletionBatchHandler } from "./lib/groupDeletionBatchProcessor";
import { processGroupDeletionFailureNotificationHandler } from "./lib/groupDeletionFailureNotification";
import { resumeGroupDeletionHandler } from "./lib/groupDeletionResume";
import { startGroupDeletionHandler } from "./lib/groupDeletionStart";
import { createGroupDeletionJobReader } from "../../lib/convex/groupDeletion/convexGroupDeletionWorkflow";

export { processGroupDeletionFailureNotificationHandler };
export { recordRetry } from "./lib/groupDeletionBatchRetry";
export { resumeGroupDeletionHandler };
export { startGroupDeletionHandler };

export const processGroupDeletionFailureNotification = internalMutation({
  args: { jobId: v.id("groupDeletionJobs") },
  returns: v.null(),
  handler: async (ctx, args) => await processGroupDeletionFailureNotificationHandler(ctx, args),
});

export const startGroupDeletion = internalMutation({
  args: {
    groupId: v.id("groups"),
    source: groupDeletionSourceValidator,
    actorUserIdSnapshot: v.optional(v.string()),
  },
  returns: v.id("groupDeletionJobs"),
  handler: startGroupDeletionHandler,
});

export const getGroupDeletionStatus = internalQuery({
  args: { jobId: v.id("groupDeletionJobs") },
  returns: v.union(
    v.null(),
    v.object({
      jobId: v.id("groupDeletionJobs"),
      targetGroupIdSnapshot: v.string(),
      targetGroupNameSnapshot: v.string(),
      source: groupDeletionSourceValidator,
      actorUserIdSnapshot: v.optional(v.string()),
      status: groupDeletionStatusValidator,
      stage: groupDeletionStageValidator,
      isActive: v.boolean(),
      attemptCount: v.number(),
      maxAttempts: v.number(),
      nextRetryAt: v.optional(v.number()),
      lastErrorCategory: v.optional(v.string()),
      snapshotCursor: v.optional(v.string()),
      failureNotificationHandledAt: v.optional(v.number()),
      deletedCounts: groupDeletionCountsValidator,
      createdAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await createGroupDeletionJobReader(ctx).get(args.jobId);
    if (job === null) {
      return null;
    }
    return {
      jobId: job.id as typeof args.jobId,
      targetGroupIdSnapshot: job.targetGroupIdSnapshot,
      targetGroupNameSnapshot: job.targetGroupNameSnapshot,
      source: job.source,
      actorUserIdSnapshot: job.actorUserIdSnapshot,
      status: job.status,
      stage: job.stage,
      isActive: job.isActive,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextRetryAt: job.nextRetryAt,
      lastErrorCategory: job.lastErrorCategory,
      snapshotCursor: job.snapshotCursor,
      failureNotificationHandledAt: job.failureNotificationHandledAt,
      deletedCounts: job.deletedCounts,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  },
});

export const resumeGroupDeletion = internalMutation({
  args: { jobId: v.id("groupDeletionJobs") },
  returns: v.null(),
  handler: resumeGroupDeletionHandler,
});

export const processGroupDeletionBatch = internalMutation({
  args: { jobId: v.id("groupDeletionJobs") },
  returns: v.null(),
  handler: processGroupDeletionBatchHandler,
});
