import type { ActionCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { internal } from "../../../convex/_generated/api";
import type { LineLinkScheduler } from "../../domain/lineLink/scheduler";

export function createLineLinkScheduler(ctx: Pick<ActionCtx, "scheduler">): LineLinkScheduler {
  return {
    async scheduleRequestExpiration(delayMs, requestId) {
      await ctx.scheduler.runAfter(delayMs, internal.lineLink.internal.expireRequest, {
        requestId: requestId as Id<"lineLinkRequests">,
      });
    },
  };
}
