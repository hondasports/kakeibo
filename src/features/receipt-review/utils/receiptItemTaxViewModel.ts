import type {
  AmountBasis,
  ExtractedTaxSummary,
  TaxContextResolution,
  TaxResolutionSource,
} from "../../../../lib/receiptTax/types";
import type { AiExpenseDraftItem, ReviewItemValues } from "../types/types";
import {
  formatTaxRateLabel,
  formatYenLabel,
  getAmountBasisLabel,
  getReviewReasonLabel,
  getTaxResolutionSourceLabel,
} from "./receiptTaxLabels";

export type ReceiptAnalysisStatus = "resolved" | "needs_review";

export type ReceiptItemTaxViewModel = {
  itemName: string;
  printedAmountLabel: string;
  normalizedAmountLabel: string;
  taxRateLabel: string;
  amountBasisLabel: string;
  allocatedTaxLabel: string;
  status: "resolved" | "unresolved";
  resolutionReasonLabel?: string;
  reviewReasonLabels: string[];
  markerLabels: string[];
  showAmountBasisSelect: boolean;
};

export type ReceiptAnalysisViewModel = {
  status: ReceiptAnalysisStatus;
  unresolvedCount: number;
  warningCount: number;
  paidTotalLabel: string;
  normalizedItemsTotalLabel: string;
  differenceYen?: number;
  showDifference: boolean;
};

type TaxContextSourceItem = {
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxRatePercent?: 0 | 8 | 10 | null;
  amountBasis?: AmountBasis;
  taxReviewReasons?: string[];
};

function buildTaxContext(item: TaxContextSourceItem): TaxContextResolution {
  if (
    item.taxResolutionStatus === "resolved" &&
    item.taxResolutionSource &&
    item.taxRatePercent !== null &&
    item.taxRatePercent !== undefined &&
    item.amountBasis &&
    item.amountBasis !== "unknown"
  ) {
    return {
      status: "resolved",
      taxRatePercent: item.taxRatePercent,
      amountBasis: item.amountBasis,
      source: item.taxResolutionSource,
    };
  }
  return {
    status: "unresolved",
    taxRatePercent: item.taxRatePercent ?? null,
    amountBasis: item.amountBasis ?? "unknown",
    reasons: item.taxReviewReasons ?? [],
  };
}

export function buildTaxContextFromReviewItem(item: ReviewItemValues): TaxContextResolution {
  return buildTaxContext(item);
}

export function buildTaxContextFromDraftItem(item: AiExpenseDraftItem): TaxContextResolution {
  return buildTaxContext(item);
}

export function toReceiptItemTaxViewModel(item: ReviewItemValues): ReceiptItemTaxViewModel {
  const context = buildTaxContextFromReviewItem(item);
  const printedAmountYen =
    item.printedAmountYen ??
    (Number.isFinite(Number(item.amountYen)) ? Number(item.amountYen) : undefined);
  const normalizedAmountYen =
    item.normalizedAmountYen ??
    (Number.isFinite(Number(item.amountYen)) ? Number(item.amountYen) : undefined);

  return {
    itemName: item.itemName,
    printedAmountLabel: formatYenLabel(printedAmountYen),
    normalizedAmountLabel:
      item.taxAllocationStatus === "allocated" ? formatYenLabel(normalizedAmountYen) : "未確定",
    taxRateLabel: formatTaxRateLabel(context.taxRatePercent),
    amountBasisLabel: getAmountBasisLabel(context.amountBasis),
    allocatedTaxLabel:
      item.taxAllocationStatus === "allocated" ? formatYenLabel(item.allocatedTaxYen) : "未確定",
    status: context.status,
    resolutionReasonLabel:
      context.status === "resolved" ? getTaxResolutionSourceLabel(context.source) : undefined,
    reviewReasonLabels:
      context.status === "unresolved" ? context.reasons.map(getReviewReasonLabel) : [],
    markerLabels: item.markers ?? (item.taxMarker ? [item.taxMarker] : []),
    showAmountBasisSelect: context.status === "unresolved" && context.amountBasis === "unknown",
  };
}

export function toReceiptAnalysisViewModel(args: {
  reviewItems: ReviewItemValues[];
  paidTotalYen?: number;
  draftWarnings?: string[];
}): ReceiptAnalysisViewModel {
  const unresolvedCount = args.reviewItems.filter(
    (item) => buildTaxContextFromReviewItem(item).status === "unresolved",
  ).length;
  const normalizedItemsTotalYen = args.reviewItems.reduce(
    (sum, item) => sum + (item.normalizedAmountYen ?? (Number(item.amountYen) || 0)),
    0,
  );
  const paidTotalYen = args.paidTotalYen ?? 0;
  const differenceYen =
    args.paidTotalYen !== undefined ? paidTotalYen - normalizedItemsTotalYen : undefined;
  const showDifference = differenceYen !== undefined && differenceYen !== 0;
  const warningCount =
    (args.draftWarnings?.length ?? 0) +
    args.reviewItems.reduce((sum, item) => sum + (item.warnings?.length ?? 0), 0);

  return {
    status: unresolvedCount > 0 || showDifference ? "needs_review" : "resolved",
    unresolvedCount,
    warningCount,
    paidTotalLabel: formatYenLabel(args.paidTotalYen),
    normalizedItemsTotalLabel: formatYenLabel(normalizedItemsTotalYen),
    differenceYen,
    showDifference,
  };
}

export function getTaxModeLabel(taxMode: ExtractedTaxSummary["taxMode"]): string {
  switch (taxMode) {
    case "external":
      return "外税";
    case "included":
      return "内税";
    case "mixed":
      return "混在";
    default:
      return "不明";
  }
}
