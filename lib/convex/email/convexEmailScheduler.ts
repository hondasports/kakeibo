import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EmailJobScheduler } from "../../domain/email/store";

type SchedulerCtx = {
  scheduler: {
    runAfter(delayMs: number, reference: unknown, args: unknown): Promise<unknown>;
  };
};

export function createEmailScheduler(ctx: SchedulerCtx): EmailJobScheduler {
  return {
    async scheduleProcessJob(delayMs, jobId) {
      await ctx.scheduler.runAfter(delayMs, internal.email.actions.processEmailJob, {
        jobId: jobId as Id<"transactionalEmailJobs">,
      });
    },
    async scheduleCleanup(delayMs) {
      await ctx.scheduler.runAfter(delayMs, internal.email.cleanup.cleanupOldEmailRecords, {});
    },
  };
}
