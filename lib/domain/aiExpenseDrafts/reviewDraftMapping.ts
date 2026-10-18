import { resolveReceiptTaxChoices } from "./receiptDataContract";
import { resolveReviewItemDisplayAmountYen } from "./reviewItemAmounts";
import { getDraftTitle } from "./title";
import type {
  AiExpenseDraft,
  AiExpenseDraftWithItems,
  ReviewFormValues,
  ReviewItemValues,
} from "./reviewTypes";

export function mapDraftToReviewForm(draft: AiExpenseDraft): ReviewFormValues {
  const choices = resolveReceiptTaxChoices(draft);
  return {
    documentType: draft.documentType,
    shopName: getDraftTitle(draft, ""),
    date: draft.date ?? "",
    amountYen: draft.amountYen?.toString() ?? "",
    categoryId: draft.categoryId ?? "",
    registrationMode: draft.registrationMode ?? "detailed",
    ...choices,
  };
}

export function mapDraftItemsToReviewItems(
  items: AiExpenseDraftWithItems["items"],
): ReviewItemValues[] {
  return items.map((item, index) => {
    const displayAmountYen = resolveReviewItemDisplayAmountYen(item);

    return {
      id: item._id ?? `item-${index}`,
      persistedItemId: item._id,
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: displayAmountYen.toString(),
      printedAmountYen: item.printedAmountYen,
      amountBasis: item.amountBasis,
      taxRatePercent: item.taxRatePercent,
      taxMarker: item.taxMarker,
      markers: item.markers,
      allocatedTaxYen: item.allocatedTaxYen,
      taxAllocationStatus: item.taxAllocationStatus,
      normalizedAmountYen: item.normalizedAmountYen,
      taxResolutionStatus: item.taxResolutionStatus,
      taxResolutionSource: item.taxResolutionSource,
      taxReviewReasons: item.taxReviewReasons,
      taxConfirmedFields: item.taxConfirmedFields,
      quantity: item.quantity,
      unitPriceYen: item.unitPriceYen,
      categoryId: item.categoryId ?? "",
      confidence: item.confidence,
      warnings: item.warnings,
    };
  });
}
