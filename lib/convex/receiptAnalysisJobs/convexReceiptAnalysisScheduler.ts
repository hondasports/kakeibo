import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { ReceiptAnalysisScheduler } from "../../domain/receiptAnalysisJobs/store";

export function createReceiptAnalysisScheduler(
  ctx: Pick<MutationCtx, "scheduler">,
): ReceiptAnalysisScheduler {
  return {
    async scheduleAiReviewCheck(delayMs, batchId) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.receiptAnalysisJobs.actions.checkAiReviewRequired,
        {
          batchId: batchId as Id<"receiptAnalysisBatches">,
        },
      );
    },
  };
}
