import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { ConvexError } from "convex/values";
import type {
  ReceiptDraftValueSnapshot,
  ReceiptUserOverrideSnapshot,
} from "../../domain/aiExpenseDrafts/receiptDataContract";

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

export async function resetReceiptToAiInterpretationHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
  groupId: Id<"groups">,
) {
  const draft = await ctx.db.get(args.draftId);
  if (draft === null || draft.groupId !== groupId) {
    throw new ConvexError("AI expense draft not found");
  }
  if (draft.status === "registered") {
    throw new ConvexError("Registered AI expense draft cannot be reset");
  }
  const interpretation = draft.receiptInterpretation;
  if (interpretation === undefined) {
    throw new ConvexError("AI interpretation snapshot is not available for this legacy draft");
  }
  const values = interpretation.values;
  const currentItems = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .take(100);
  for (const item of currentItems) {
    await ctx.db.delete(item._id);
  }
  const now = Date.now();
  for (const item of values.items) {
    await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId: args.draftId,
      ...item,
      createdAt: now,
      updatedAt: now,
    });
  }
  await ctx.db.patch(args.draftId, {
    status: values.status,
    documentType: values.documentType,
    shopName: values.shopName,
    paymentPlace: values.paymentPlace,
    payeeName: values.payeeName,
    paymentPurpose: values.paymentPurpose,
    date: values.date,
    amountYen: values.amountYen,
    registrationMode: values.registrationMode,
    taxSummaries: values.taxSummaries,
    receiptTotalResolution: values.receiptTotalResolution,
    receiptTaxDecision: values.receiptTaxDecision,
    markerDefinitions: values.markerDefinitions,
    categoryId: values.categoryId,
    confidence: values.confidence,
    warnings: values.warnings,
    reviewReasons: values.reviewReasons,
    receiptUserOverride: undefined,
    updatedAt: now,
  });
  const updatedDraft = await ctx.db.get(args.draftId);
  if (updatedDraft === null) {
    throw new ConvexError("AI expense draft not found after reset");
  }
  const updatedItems = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .take(100);
  return { draft: updatedDraft, items: updatedItems };
}
