import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { classifyAiExpenseDraft } from "../../../convex/aiExpenseDrafts/model";
import { deriveTaxReviewReasons, mapDraftItemToTaxFields } from "../../receiptTax/draftTaxMapping";
import {
  reinterpretDraftTax,
  type BulkUnresolvedTaxOverride,
  type DraftSummaryOverride,
  type DraftTaxOverride,
  type ReinterpretDraftTaxInput,
} from "../../receiptTax/reinterpretDraftTax";
import {
  filterNonInterpretationWarnings,
  mergeReviewReasons,
  nonTaxReviewReasons,
} from "../../../lib/domain/aiExpenseDrafts/reviewReasons";
import type { AiExpenseDraftReviewReason } from "../../../lib/domain/aiExpenseDrafts/constants";

export type PersistDraftTaxInterpretationArgs = {
  draftId: Id<"aiExpenseDrafts">;
  groupId: Id<"groups">;
  preservedNonTaxReasons?: AiExpenseDraftReviewReason[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
  summaryOverride?: DraftSummaryOverride;
  receiptTotalSource?: "explicit_label" | "user_confirmed" | "ai_estimate";
  decisionOverride?: ReinterpretDraftTaxInput["decisionOverride"];
};

export type PersistDraftTaxInterpretationResult = {
  draft: Doc<"aiExpenseDrafts">;
  items: Doc<"aiExpenseDraftItems">[];
};

export async function persistDraftTaxInterpretation(
  ctx: MutationCtx,
  args: PersistDraftTaxInterpretationArgs,
): Promise<PersistDraftTaxInterpretationResult> {
  const draft = await ctx.db.get(args.draftId);
  if (draft === null) {
    throw new ConvexError("AI expense draft not found");
  }
  if (draft.groupId !== args.groupId) {
    throw new ConvexError("AI expense draft does not belong to the current group");
  }
  if (
    draft.amountYen === undefined ||
    ((!draft.taxSummaries || draft.taxSummaries.length === 0) &&
      args.decisionOverride === undefined)
  ) {
    throw new ConvexError("Tax reinterpretation requires draft amount and tax summaries");
  }

  const items = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .collect();

  const persistedReceiptTotalSource = draft.receiptTotalResolution?.candidates.find(
    (candidate) => candidate.amountYen === draft.amountYen,
  )?.source;
  const receiptTotalSource =
    persistedReceiptTotalSource === "explicit_label" ||
    persistedReceiptTotalSource === "user_confirmed" ||
    persistedReceiptTotalSource === "ai_estimate"
      ? persistedReceiptTotalSource
      : "ai_estimate";
  const receiptTotalSupportingCandidates = draft.receiptTotalResolution?.candidates.filter(
    (candidate) =>
      candidate.source !== "tax_summary_total" && candidate.source !== "tax_arithmetic",
  );

  const { interpretation, itemFields } = reinterpretDraftTax({
    amountYen: draft.amountYen,
    receiptTotalSource: args.receiptTotalSource ?? receiptTotalSource,
    receiptTotalConfidence: draft.confidence.amountYen,
    receiptTotalSupportingCandidates,
    taxSummaries: draft.taxSummaries ?? [],
    markerDefinitions: draft.markerDefinitions,
    rawObservationLines: draft.rawObservation?.lines,
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
    items: items.map(mapDraftItemToTaxFields),
    override: args.override,
    bulkUnresolvedOverride: args.bulkUnresolvedOverride,
    summaryOverride: args.summaryOverride,
    decisionOverride: args.decisionOverride,
  });

  const ignoresTaxDetails = draft.registrationMode === "totalOnly";
  const taxReviewReasons = ignoresTaxDetails ? [] : deriveTaxReviewReasons(interpretation);
  const preservedReasons = args.preservedNonTaxReasons ?? nonTaxReviewReasons(draft.reviewReasons);
  const mergedTaxReasons = mergeReviewReasons(taxReviewReasons, preservedReasons);
  const classification = classifyAiExpenseDraft({
    documentType: draft.documentType,
    shopName: draft.shopName,
    paymentPlace: draft.paymentPlace,
    payeeName: draft.payeeName,
    paymentPurpose: draft.paymentPurpose,
    date: draft.date,
    amountYen: draft.amountYen,
    categoryId: draft.categoryId,
    confidence: draft.confidence,
    warnings: ignoresTaxDetails
      ? filterNonInterpretationWarnings(draft.warnings ?? [])
      : interpretation.warnings,
    multiCategoryConfirmed: true,
    items: ignoresTaxDetails
      ? undefined
      : items.map((item, index) => ({
          itemName: item.itemName,
          amountYen: itemFields[index]?.normalizedAmountYen ?? item.amountYen,
          categoryId: item.categoryId,
        })),
  });
  const reviewReasons = mergeReviewReasons(classification.reviewReasons, mergedTaxReasons);
  const status = reviewReasons.length === 0 ? "ready" : "needs_review";

  const now = Date.now();
  for (const [index, item] of items.entries()) {
    const fields = itemFields[index];
    if (!fields) {
      continue;
    }
    await ctx.db.patch(item._id, {
      printedAmountYen: item.printedAmountYen ?? fields.printedAmountYen ?? item.amountYen,
      amountYen: fields.normalizedAmountYen ?? item.amountYen,
      amountBasis: fields.amountBasis,
      taxRatePercent: fields.taxRatePercent,
      allocatedTaxYen: fields.allocatedTaxYen,
      taxAllocationStatus: fields.taxAllocationStatus,
      normalizedAmountYen: fields.normalizedAmountYen,
      taxResolutionStatus: fields.taxResolutionStatus,
      taxResolutionSource: fields.taxResolutionSource,
      taxReviewReasons: fields.taxReviewReasons,
      warnings: fields.warnings,
      updatedAt: now,
    });
  }

  const nonInterpretationWarnings = filterNonInterpretationWarnings(draft.warnings ?? []);

  await ctx.db.patch(args.draftId, {
    status,
    taxSummaries: interpretation.taxSummaries,
    receiptTotalResolution: interpretation.receiptTotalResolution,
    receiptTaxDecision: interpretation.decision,
    warnings: [...new Set([...nonInterpretationWarnings, ...interpretation.warnings])],
    reviewReasons,
    updatedAt: now,
  });

  const updatedDraft = await ctx.db.get(args.draftId);
  if (updatedDraft === null) {
    throw new ConvexError("Failed to retrieve updated AI expense draft");
  }

  const updatedItems = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .collect();

  return { draft: updatedDraft, items: updatedItems };
}
