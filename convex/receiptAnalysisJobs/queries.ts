import schema from "../schema";
import {
  MAX_RECEIPT_ANALYSIS_DRAFT_IDS,
  ReceiptAnalysisJobDomainError,
} from "../../lib/domain/receiptAnalysisJobs/rules";
import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import { jobRecordToDoc } from "../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore";
import { createReceiptAnalysisQueryDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import {
  listReceiptAnalysisJobsByDraftIds,
  listActiveReceiptAnalysisJobs,
  listReceiptAnalysisJobsByBatch,
} from "../../lib/usecase/receiptAnalysisJobs/queries";
import { toConvexEndpointError } from "../lib/errors";

const jobDocumentValidator = v.object({
  ...schema.tables.receiptAnalysisImageJobs.validator.fields,
  _id: v.id("receiptAnalysisImageJobs"),
  _creationTime: v.number(),
});

function convexError(error: unknown): never {
  toConvexEndpointError(error, [ReceiptAnalysisJobDomainError]);
}

export async function listActiveJobsHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  return (
    await listActiveReceiptAnalysisJobs(createReceiptAnalysisQueryDeps(ctx).reader, groupId)
  ).map(jobRecordToDoc);
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
    convexError(error);
  }
}

export async function listJobsByDraftIdsHandler(
  ctx: QueryCtx,
  { draftIds }: { draftIds: Id<"aiExpenseDrafts">[] },
): Promise<Doc<"receiptAnalysisImageJobs">[]> {
  const { groupId } = await requireGroupMembership(ctx);
  if (draftIds.length > MAX_RECEIPT_ANALYSIS_DRAFT_IDS) {
    throw new ConvexError(`下書きIDは${MAX_RECEIPT_ANALYSIS_DRAFT_IDS}件まで指定できます`);
  }
  return (
    await listReceiptAnalysisJobsByDraftIds(
      createReceiptAnalysisQueryDeps(ctx).reader,
      groupId,
      draftIds,
    )
  ).map(jobRecordToDoc);
}

export const listActiveJobs = query({ args: {}, handler: listActiveJobsHandler });
export const listJobsByBatch = query({
  args: { batchId: v.id("receiptAnalysisBatches") },
  handler: listJobsByBatchHandler,
});
export const listJobsByDraftIds = query({
  args: { draftIds: v.array(v.id("aiExpenseDrafts")) },
  returns: v.array(jobDocumentValidator),
  handler: listJobsByDraftIdsHandler,
});
