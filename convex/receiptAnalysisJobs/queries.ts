import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import {
  batchRecordToDoc,
  jobRecordToDoc,
} from "../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore";
import { createReceiptAnalysisQueryDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import {
  getReceiptAnalysisJobByDraftId,
  listReceiptAnalysisBatches,
  listReceiptAnalysisJobs,
  listReceiptAnalysisJobsByBatch,
} from "../../lib/usecase/receiptAnalysisJobs/queries";

export async function listBatchesHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  return (
    await listReceiptAnalysisBatches(createReceiptAnalysisQueryDeps(ctx).reader, groupId)
  ).map(batchRecordToDoc);
}

export async function listJobsHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  return (await listReceiptAnalysisJobs(createReceiptAnalysisQueryDeps(ctx).reader, groupId)).map(
    jobRecordToDoc,
  );
}

export async function listJobsByBatchHandler(
  ctx: QueryCtx,
  { batchId }: { batchId: Id<"receiptAnalysisBatches"> },
) {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    return (
      await listReceiptAnalysisJobsByBatch(
        createReceiptAnalysisQueryDeps(ctx).reader,
        groupId,
        batchId,
      )
    ).map(jobRecordToDoc);
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function getJobByDraftIdHandler(
  ctx: QueryCtx,
  { draftId }: { draftId: Id<"aiExpenseDrafts"> },
) {
  const { groupId } = await requireGroupMembership(ctx);
  const job = await getReceiptAnalysisJobByDraftId(
    createReceiptAnalysisQueryDeps(ctx).reader,
    groupId,
    draftId,
  );
  return job === null ? null : jobRecordToDoc(job);
}

export const listBatches = query({ args: {}, handler: listBatchesHandler });
export const listJobs = query({ args: {}, handler: listJobsHandler });
export const listJobsByBatch = query({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: listJobsByBatchHandler,
});
export const getJobByDraftId = query({
  args: { draftId: v.id("aiExpenseDrafts") },
  handler: getJobByDraftIdHandler,
});
