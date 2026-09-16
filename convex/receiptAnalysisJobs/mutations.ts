import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import {
  batchRecordToDoc,
  jobRecordToDoc,
} from "../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore";
import { createReceiptAnalysisMutationDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import {
  cancelReceiptAnalysisJob,
  createReceiptAnalysisBatch,
  retryReceiptAnalysisJob,
} from "../../lib/usecase/receiptAnalysisJobs/operations";

export type CreateBatchArgs = { fileNames: string[] };
export type RetryImageJobArgs = { jobId: Id<"receiptAnalysisImageJobs"> };
export type CancelImageJobArgs = { jobId: Id<"receiptAnalysisImageJobs"> };

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
}

export async function createBatchHandler(
  ctx: MutationCtx,
  args: CreateBatchArgs,
): Promise<{ batch: Doc<"receiptAnalysisBatches">; jobs: Doc<"receiptAnalysisImageJobs">[] }> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  try {
    const result = await createReceiptAnalysisBatch(
      createReceiptAnalysisMutationDeps(ctx).store,
      groupId,
      userId,
      args.fileNames,
    );
    return { batch: batchRecordToDoc(result.batch), jobs: result.jobs.map(jobRecordToDoc) };
  } catch (error) {
    convexError(error);
  }
}

export async function retryImageJobHandler(ctx: MutationCtx, args: RetryImageJobArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    await retryReceiptAnalysisJob(
      createReceiptAnalysisMutationDeps(ctx).store,
      groupId,
      args.jobId,
    );
  } catch (error) {
    convexError(error);
  }
}

export async function cancelImageJobHandler(ctx: MutationCtx, args: CancelImageJobArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    await cancelReceiptAnalysisJob(
      createReceiptAnalysisMutationDeps(ctx).store,
      groupId,
      args.jobId,
    );
  } catch (error) {
    convexError(error);
  }
}

export const createBatch = mutation({
  args: { fileNames: v.array(v.string()) },
  handler: createBatchHandler,
});

export const retryImageJob = mutation({
  args: { jobId: v.id("receiptAnalysisImageJobs") },
  handler: retryImageJobHandler,
});

export const cancelImageJob = mutation({
  args: { jobId: v.id("receiptAnalysisImageJobs") },
  handler: cancelImageJobHandler,
});
