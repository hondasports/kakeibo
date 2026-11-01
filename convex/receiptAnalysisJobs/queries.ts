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
import {
  batchRecordToDoc,
  jobRecordToDoc,
} from "../../lib/convex/receiptAnalysisJobs/convexReceiptAnalysisStore";
import { createReceiptAnalysisQueryDeps } from "../../lib/convex/receiptAnalysisJobs/receiptAnalysisDeps";
import {
  listReceiptAnalysisJobsByDraftIds,
  listReceiptAnalysisBatches,
  listActiveReceiptAnalysisJobs,
  listReceiptAnalysisJobsByBatch,
} from "../../lib/usecase/receiptAnalysisJobs/queries";

const jobDocumentValidator = v.object({
  ...schema.tables.receiptAnalysisImageJobs.validator.fields,
  _id: v.id("receiptAnalysisImageJobs"),
  _creationTime: v.number(),
});

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  // ドメインエラーだけを endpoint 契約の ConvexError へ変換する。
  // DB・アダプタ由来の予期しないエラーはそのまま再送出し、メッセージを露出させない。
  if (error instanceof ReceiptAnalysisJobDomainError) throw new ConvexError(error.message);
  throw error;
}

export async function listBatchesHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupMembership(ctx);
  return (
    await listReceiptAnalysisBatches(createReceiptAnalysisQueryDeps(ctx).reader, groupId)
  ).map(batchRecordToDoc);
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

export const listBatches = query({ args: {}, handler: listBatchesHandler });
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
