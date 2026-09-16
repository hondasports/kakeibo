import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";

export async function scheduleBatch(
  ctx: Pick<MutationCtx, "scheduler">,
  jobId: Id<"groupDeletionJobs">,
  delayMs = 0,
) {
  await ctx.scheduler.runAfter(delayMs, internal.groups.groupDeletion.processGroupDeletionBatch, {
    jobId,
  });
}

export async function scheduleFailureNotification(
  ctx: Pick<MutationCtx, "scheduler">,
  jobId: Id<"groupDeletionJobs">,
  delayMs = 0,
) {
  await ctx.scheduler.runAfter(
    delayMs,
    internal.groups.groupDeletion.processGroupDeletionFailureNotification,
    { jobId },
  );
}
