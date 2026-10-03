import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActionCtx } from "../../../convex/_generated/server";
import type {
  LineNotificationActionRunner,
  LineNotificationClaimResult,
} from "../../domain/notifications/runner";

export function createLineNotificationActionRunner(
  ctx: Pick<ActionCtx, "runMutation">,
): LineNotificationActionRunner {
  return {
    async claimJob(args) {
      return (await ctx.runMutation(internal.notifications.internal.claimLineNotificationJob, {
        jobId: args.jobId as Id<"lineNotificationJobs">,
        retryKeyCandidate: args.retryKeyCandidate,
        leaseMs: args.leaseMs,
        now: args.now,
      })) as LineNotificationClaimResult;
    },
    async completeJob(args) {
      await ctx.runMutation(internal.notifications.internal.completeLineNotificationJob, {
        jobId: args.jobId as Id<"lineNotificationJobs">,
        attemptCount: args.attemptCount,
        completion: args.completion,
        now: args.now,
      });
    },
  };
}
