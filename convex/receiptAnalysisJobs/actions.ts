import { ConvexError, v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { createReceiptAnalysisActionDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import {
  analyzeReceiptImageJob,
  checkReceiptAiReviewRequired,
} from "../../lib/usecase/receiptAnalysisJobs/actions";

export type CheckAiReviewRequiredArgs = { batchId: Id<"receiptAnalysisBatches"> };
export type AnalyzeImageJobArgs = { jobId: Id<"receiptAnalysisImageJobs">; imageDataUrl: string };

export async function analyzeImageJobHandler(ctx: ActionCtx, args: AnalyzeImageJobArgs) {
  try {
    await analyzeReceiptImageJob(createReceiptAnalysisActionDeps(ctx).runner, args);
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
  }
}

export const analyzeImageJob = action({
  args: { jobId: v.id("receiptAnalysisImageJobs"), imageDataUrl: v.string() },
  handler: analyzeImageJobHandler,
});

export async function checkAiReviewRequiredHandler(
  ctx: ActionCtx,
  { batchId }: CheckAiReviewRequiredArgs,
): Promise<void> {
  await checkReceiptAiReviewRequired(createReceiptAnalysisActionDeps(ctx).runner, batchId);
}

export const checkAiReviewRequired = internalAction({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: checkAiReviewRequiredHandler,
});
