import type { DraftItemTaxFields } from "./draftTaxMapping";
import type { ReceiptItemTaxConfirmedField, TaxRatePercent } from "./types";

export const ITEM_IDENTITY_CHANGED = "item_identity_changed";

export function getItemTaxConfirmedFields(
  item: DraftItemTaxFields,
): ReceiptItemTaxConfirmedField[] {
  if (item.taxConfirmedFields !== undefined) return item.taxConfirmedFields;
  if (
    item.taxResolutionStatus === "unresolved" ||
    (item.taxResolutionSource !== undefined && item.taxResolutionSource !== "item_explicit")
  )
    return [];
  return [
    ...(item.amountBasis && item.amountBasis !== "unknown" ? ["amountBasis" as const] : []),
    ...(item.taxRatePercent != null ? ["taxRatePercent" as const] : []),
  ];
}

export function invalidateItemTaxRateConfirmation<T extends DraftItemTaxFields>(item: T): T {
  return {
    ...item,
    taxConfirmedFields: getItemTaxConfirmedFields(item).filter(
      (field) => field !== "taxRatePercent",
    ),
    taxReviewReasons: [...new Set([...(item.taxReviewReasons ?? []), ITEM_IDENTITY_CHANGED])],
    taxResolutionStatus: "unresolved",
    taxAllocationStatus: "unallocated",
    allocatedTaxYen: 0,
    normalizedAmountYen: item.printedAmountYen,
    markers: [],
    taxMarker: undefined,
  };
}

export function confirmItemTaxRate<T extends DraftItemTaxFields>(
  item: T,
  rate: TaxRatePercent | null,
): T {
  const fields = getItemTaxConfirmedFields(item).filter((field) => field !== "taxRatePercent");
  return {
    ...item,
    taxRatePercent: rate,
    taxConfirmedFields: rate === null ? fields : [...fields, "taxRatePercent"],
    taxReviewReasons:
      rate === null
        ? item.taxReviewReasons
        : item.taxReviewReasons?.filter((reason) => reason !== ITEM_IDENTITY_CHANGED),
  };
}
