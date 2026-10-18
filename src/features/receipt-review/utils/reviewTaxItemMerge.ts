import {
  ITEM_IDENTITY_CHANGED,
  confirmItemTaxRate,
  invalidateItemTaxRateConfirmation,
} from "../../../../lib/domain/receipt/tax/itemTaxConfirmation";
import type { ReviewItemValues } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";

/** Tax responses update tax fields, without discarding edits owned by the open form. */
export function mergeReviewTaxItems(
  current: ReviewItemValues[],
  refreshed: ReviewItemValues[],
  rateConfirmations?: Array<
    Pick<ReviewItemValues, "id" | "itemName" | "lineType"> & {
      taxRatePercent: 0 | 8 | 10 | null;
    }
  >,
): ReviewItemValues[] {
  const byId = new Map(refreshed.map((item) => [item.id, item]));
  return current.map((item) => {
    const updated = byId.get(item.id);
    if (!updated) return item;
    const amountChanged = item.amountYen !== updated.amountYen;
    let merged: ReviewItemValues = {
      ...updated,
      ...(amountChanged
        ? {
            printedAmountYen: Number(item.amountYen),
            normalizedAmountYen: undefined,
            allocatedTaxYen: undefined,
            taxAllocationStatus: "unallocated" as const,
            taxResolutionStatus: "unresolved" as const,
          }
        : {}),
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: item.amountYen,
      categoryId: item.categoryId,
      usesReceiptCategory: item.usesReceiptCategory,
      discountTargetItemId: item.discountTargetItemId,
      confirmedTaxRatePercent: item.confirmedTaxRatePercent,
    };
    if (item.taxReviewReasons?.includes(ITEM_IDENTITY_CHANGED)) {
      merged = invalidateItemTaxRateConfirmation(merged);
    }
    const rateConfirmation = rateConfirmations?.find((confirmation) => confirmation.id === item.id);
    const requestedRate =
      rateConfirmation?.id === item.id &&
      rateConfirmation.itemName.trim() === item.itemName.trim() &&
      (rateConfirmation.lineType ?? "item") === (item.lineType ?? "item")
        ? rateConfirmation.taxRatePercent
        : item.confirmedTaxRatePercent;
    if (requestedRate !== undefined) {
      merged = {
        ...confirmItemTaxRate(merged, requestedRate),
        confirmedTaxRatePercent: requestedRate,
      };
    }
    return merged;
  });
}
