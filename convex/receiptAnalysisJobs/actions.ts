import { ConvexError, v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { createReceiptAnalysisActionDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import { ReceiptAnalysisJobDomainError } from "../../lib/domain/receiptAnalysisJobs/rules";
import {
  analyzeReceiptImageJob,
  checkReceiptAiReviewRequired,
} from "../../lib/usecase/receiptAnalysisJobs/actions";

export type CheckAiReviewRequiredArgs = { batchId: Id<"receiptAnalysisBatches"> };
export type AnalyzeImageJobArgs = { jobId: Id<"receiptAnalysisImageJobs">; imageDataUrl: string };

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  // ドメインエラーだけを endpoint 契約の ConvexError へ変換する。
  // DB・アダプタ由来の予期しないエラーはそのまま再送出し、メッセージを露出させない。
  if (error instanceof ReceiptAnalysisJobDomainError) throw new ConvexError(error.message);
  throw error;
}

export async function analyzeImageJobHandler(ctx: ActionCtx, args: AnalyzeImageJobArgs) {
  try {
    await analyzeReceiptImageJob(createReceiptAnalysisActionDeps(ctx).runner, args);
  } catch (error) {
    convexError(error);
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
