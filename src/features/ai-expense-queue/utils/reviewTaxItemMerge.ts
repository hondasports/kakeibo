import type { ReviewItemValues } from "../types/types";

/** Tax responses update tax fields, without discarding edits owned by the open form. */
export function mergeReviewTaxItems(
  current: ReviewItemValues[],
  refreshed: ReviewItemValues[],
): ReviewItemValues[] {
  const byId = new Map(refreshed.map((item) => [item.id, item]));
  return current.map((item) => {
    const updated = byId.get(item.id);
    if (!updated) return item;
    const amountChanged = item.amountYen !== updated.amountYen;
    return {
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
    };
  });
}
