/**
 * AccountDeletionScheduler の Convex 実装。
 * internal endpoint 参照（generated API）はここに閉じ込める。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { internal } from "../../../convex/_generated/api";
import type { AccountDeletionScheduler } from "../../domain/accountDeletion/scheduler";

export function createAccountDeletionScheduler(
  ctx: Pick<MutationCtx, "scheduler">,
): AccountDeletionScheduler {
  return {
    async schedulePrepareBatch(requestId) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.prepareAccountDeletionBatch, {
        requestId: requestId as Id<"accountDeletionRequests">,
      });
    },
    async scheduleProcess(requestId, delayMs = 0) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.accountDeletionActions.processAccountDeletion,
        { requestId: requestId as Id<"accountDeletionRequests"> },
      );
    },
    async scheduleFinalize(requestId) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.finalizeAccountDeletion, {
        requestId: requestId as Id<"accountDeletionRequests">,
      });
    },
    async scheduleResetFailedPurges(requestId) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.resetFailedAccountDeletionPurges, {
        requestId: requestId as Id<"accountDeletionRequests">,
      });
    },
    async scheduleCleanup() {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.cleanupCompletedRequests, {});
    },
    async scheduleResumeGroupDeletion(jobId) {
      await ctx.scheduler.runAfter(0, internal.groups.groupDeletion.resumeGroupDeletion, {
        jobId: jobId as Id<"groupDeletionJobs">,
      });
    },
  };
}
