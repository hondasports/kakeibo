import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import type {
  ReceiptDraftValueSnapshot,
  ReceiptUserOverrideSnapshot,
} from "../../domain/aiExpenseDrafts/receiptDataContract";
import { resetReceiptToAiInterpretation } from "../../usecase/aiExpenseDrafts/resetReceiptToAiInterpretation";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import { draftFieldsToDoc, draftItemFieldsToDoc } from "./draftRecordMapping";

export function snapshotReceiptDraftValues(
  draft: Doc<"aiExpenseDrafts">,
  items: Doc<"aiExpenseDraftItems">[],
): ReceiptDraftValueSnapshot<Id<"categories">> {
  return {
    status: draft.status,
    documentType: draft.documentType,
    shopName: draft.shopName,
    paymentPlace: draft.paymentPlace,
    payeeName: draft.payeeName,
    paymentPurpose: draft.paymentPurpose,
    date: draft.date,
    amountYen: draft.amountYen,
    registrationMode: draft.registrationMode,
    taxSummaries: draft.taxSummaries,
    receiptTotalResolution: draft.receiptTotalResolution,
    receiptTaxDecision: draft.receiptTaxDecision,
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
    markerDefinitions: draft.markerDefinitions,
    categoryId: draft.categoryId,
    confidence: draft.confidence,
    warnings: draft.warnings ?? [],
    reviewReasons: draft.reviewReasons,
    items: items.map((item) => ({
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: item.amountYen,
      printedAmountYen: item.printedAmountYen,
      amountBasis: item.amountBasis,
      taxRatePercent: item.taxRatePercent,
      markers: item.markers,
      taxMarker: item.taxMarker,
      allocatedTaxYen: item.allocatedTaxYen,
      taxAllocationStatus: item.taxAllocationStatus,
      normalizedAmountYen: item.normalizedAmountYen,
      taxResolutionStatus: item.taxResolutionStatus,
      taxResolutionSource: item.taxResolutionSource,
      taxReviewReasons: item.taxReviewReasons,
      quantity: item.quantity,
      unitPriceYen: item.unitPriceYen,
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      confidence: item.confidence,
      warnings: item.warnings,
    })),
  };
}

export async function persistReceiptUserOverrideSnapshot(
  ctx: MutationCtx,
  args: {
    draftId: Id<"aiExpenseDrafts">;
    groupId: Id<"groups">;
    fields: string[];
    updatedAt?: number;
  },
): Promise<Doc<"aiExpenseDrafts">> {
  const draft = await ctx.db.get(args.draftId);
  if (draft === null || draft.groupId !== args.groupId) {
    throw new Error("AI expense draft not found while saving user override");
  }
  const items = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .take(100);
  const updatedAt = args.updatedAt ?? Date.now();
  const receiptUserOverride: ReceiptUserOverrideSnapshot<Id<"categories">> = {
    source: "user",
    updatedAt,
    fields: [...new Set([...(draft.receiptUserOverride?.fields ?? []), ...args.fields])],
    values: snapshotReceiptDraftValues(draft, items),
  };
  await ctx.db.patch(args.draftId, { receiptUserOverride, updatedAt });
  const updated = await ctx.db.get(args.draftId);
  if (updated === null) {
    throw new Error("AI expense draft not found after saving user override");
  }
  return updated;
}

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/resetReceiptToAiInterpretation。 */
export async function resetReceiptToAiInterpretationHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
  groupId: Id<"groups">,
) {
  const result = await resetReceiptToAiInterpretation(
    { groupId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}
