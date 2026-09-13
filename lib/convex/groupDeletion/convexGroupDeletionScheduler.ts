/**
 * GroupDeletionScheduler の Convex 実装。
 * 既存の scheduling ヘルパー（internal endpoint 参照）へ委譲する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GroupDeletionScheduler } from "../../domain/groupDeletion/groupDeletionScheduler";
import {
  scheduleBatch,
  scheduleFailureNotification,
} from "../../../convex/groups/lib/groupDeletionScheduling";

export function createGroupDeletionScheduler(
  ctx: Pick<MutationCtx, "scheduler">,
): GroupDeletionScheduler {
  return {
    async scheduleBatch(jobId, delayMs = 0) {
      await scheduleBatch(ctx, jobId as Id<"groupDeletionJobs">, delayMs);
    },
    async scheduleFailureNotification(jobId, delayMs = 0) {
      await scheduleFailureNotification(ctx, jobId as Id<"groupDeletionJobs">, delayMs);
    },
  };
}
