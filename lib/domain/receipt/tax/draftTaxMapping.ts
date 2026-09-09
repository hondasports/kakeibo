import type { AiExpenseDraftReviewReason } from "../../aiExpenseDrafts/constants";
import type {
  AmountBasis,
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  InterpretedReceiptItem,
  ReceiptMarkerDefinition,
  ReceiptTaxInput,
  ReceiptTaxInterpretation,
  TaxContextResolution,
  TaxRatePercent,
  TaxResolutionSource,
} from "./types";

export type DraftItemTaxFields = {
  itemName: string;
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: TaxRatePercent | null;
  markers?: string[];
  taxMarker?: string;
  allocatedTaxYen?: number;
  taxAllocationStatus?: "allocated" | "unallocated";
  normalizedAmountYen?: number;
  quantity?: number;
  unitPriceYen?: number;
  categoryName?: string;
  warnings?: string[];
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
};

export type DraftItemTaxFieldsSource = {
  itemName: string;
  printedAmountYen?: number | null;
  amountYen: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: TaxRatePercent | null;
  markers?: string[];
  taxMarker?: string;
  categoryName?: string;
  quantity?: number | null;
  unitPriceYen?: number | null;
  warnings?: string[];
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource | null;
  taxReviewReasons?: string[];
};

/**
 * DB ドキュメントや UI 入力から、税処理用の明細フィールドへ変換する。
 * 未設定の数値は null や undefined を許容し、printedAmountYen の fallback も行う。
 */
export function mapDraftItemToTaxFields(item: DraftItemTaxFieldsSource): DraftItemTaxFields {
  return {
    itemName: item.itemName,
    printedAmountYen: item.printedAmountYen ?? item.amountYen,
    amountBasis: item.amountBasis,
    taxRatePercent: item.taxRatePercent ?? null,
    markers: item.markers,
    taxMarker: item.taxMarker,
    categoryName: item.categoryName,
    quantity: item.quantity ?? undefined,
    unitPriceYen: item.unitPriceYen ?? undefined,
    warnings: item.warnings,
    taxResolutionStatus: item.taxResolutionStatus,
    taxResolutionSource: item.taxResolutionSource ?? undefined,
    taxReviewReasons: item.taxReviewReasons,
  };
}

export function taxContextToDraftFields(taxContext: TaxContextResolution): {
  taxResolutionStatus: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
  taxRatePercent: TaxRatePercent | null;
  amountBasis: AmountBasis;
} {
  if (taxContext.status === "resolved") {
    return {
      taxResolutionStatus: "resolved",
      taxResolutionSource: taxContext.source,
      taxRatePercent: taxContext.taxRatePercent,
      amountBasis: taxContext.amountBasis,
    };
  }
  return {
    taxResolutionStatus: "unresolved",
    taxReviewReasons: taxContext.reasons,
    taxRatePercent: taxContext.taxRatePercent,
    amountBasis: taxContext.amountBasis,
  };
}

export function interpretedItemToDraftFields(item: InterpretedReceiptItem) {
  const taxFields = taxContextToDraftFields(item.taxContext);
  return {
    printedAmountYen: item.printedAmountYen,
    amountBasis: taxFields.amountBasis,
    taxRatePercent: taxFields.taxRatePercent,
    markers: item.markers,
    taxMarker: item.taxMarker,
    allocatedTaxYen: item.allocatedTaxYen,
    taxAllocationStatus: item.taxAllocationStatus,
    normalizedAmountYen: item.normalizedAmountYen,
    quantity: item.quantity,
    unitPriceYen: item.unitPriceYen,
    warnings: item.warnings,
    taxResolutionStatus: taxFields.taxResolutionStatus,
    taxResolutionSource: taxFields.taxResolutionSource,
    taxReviewReasons: taxFields.taxReviewReasons,
  };
}

export function isTaxInterpretationWarning(warning: string): boolean {
  return (
    warning.startsWith("unresolved_") ||
    warning.startsWith("missing_tax_items:") ||
    warning === "normalized_amount_mismatch" ||
    warning === "ambiguous_receipt_total" ||
    warning.startsWith("taxable_amount_mismatch:") ||
    warning.startsWith("duplicate_tax_summary:") ||
    warning.startsWith("conflicting_tax_summary:")
  );
}

export function deriveTaxReviewReasons(
  interpretation: ReceiptTaxInterpretation | undefined,
): AiExpenseDraftReviewReason[] {
  const taxWarnings = (interpretation?.warnings ?? []).filter(isTaxInterpretationWarning);
  const hasUnresolvedTax =
    interpretation?.taxSummaries.some(
      (summary) => summary.status !== "verified" && summary.status !== "coherent",
    ) ||
    interpretation?.items.some((item) => item.taxAllocationStatus === "unallocated") ||
    taxWarnings.some(
      (warning) => warning.startsWith("unresolved_") || warning.startsWith("missing_tax_items:"),
    );
  const hasTaxMismatch = taxWarnings.some(
    (warning) =>
      warning === "normalized_amount_mismatch" ||
      warning.startsWith("taxable_amount_mismatch:") ||
      warning.startsWith("duplicate_tax_summary:") ||
      warning.startsWith("conflicting_tax_summary:"),
  );
  return [
    ...(hasUnresolvedTax ? (["user_confirmation_required"] as const) : []),
    ...(hasTaxMismatch ? (["amount_mismatch"] as const) : []),
  ];
}

export function draftItemToExtractedReceiptItem(item: DraftItemTaxFields): ExtractedReceiptItem {
  return {
    itemName: item.itemName,
    printedAmountYen: item.printedAmountYen ?? 0,
    amountBasis: item.amountBasis ?? "unknown",
    taxRatePercent: item.taxRatePercent ?? null,
    markers: item.markers ?? (item.taxMarker ? [item.taxMarker] : []),
    taxMarker: item.taxMarker,
    categoryName: item.categoryName,
    quantity: item.quantity,
    unitPriceYen: item.unitPriceYen,
    warnings: item.warnings ?? [],
  };
}

export function buildReceiptTaxInput(args: {
  amountYen: number;
  items: DraftItemTaxFields[];
  taxSummaries: ExtractedTaxSummary[];
  markerDefinitions?: ReceiptMarkerDefinition[];
}): ReceiptTaxInput {
  return {
    amountYen: args.amountYen,
    items: args.items.map(draftItemToExtractedReceiptItem),
    taxSummaries: args.taxSummaries,
    markerDefinitions: args.markerDefinitions,
  };
}
