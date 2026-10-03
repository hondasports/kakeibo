import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LineNotificationScheduler } from "../../domain/notifications/store";

type SchedulerCtx = {
  scheduler: {
    runAfter(delayMs: number, reference: unknown, args: unknown): Promise<unknown>;
    runAt(timestamp: number, reference: unknown, args: unknown): Promise<unknown>;
  };
};

export function createLineNotificationScheduler(ctx: SchedulerCtx): LineNotificationScheduler {
  return {
    async scheduleProcessJob(delayMs, jobId) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.notifications.lineActions.processLineNotificationJob,
        { jobId: jobId as Id<"lineNotificationJobs"> },
      );
    },
    async scheduleLeaseRecovery(jobId, attemptCount, runAt) {
      await ctx.scheduler.runAt(
        runAt,
        internal.notifications.internal.recoverLineNotificationLease,
        { jobId: jobId as Id<"lineNotificationJobs">, attemptCount },
      );
    },
    async scheduleCleanup(delayMs) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.notifications.cleanup.cleanupOldLineNotificationJobs,
        {},
      );
    },
  };
}
