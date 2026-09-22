import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { buildTaxContextFromReviewItem } from "./receiptItemTaxViewModel";
import { formatYenLabel } from "./receiptTaxLabels";
import { getTaxModeLabel } from "./receiptItemTaxViewModel";
import { formatYenAbs } from "../../../utils/currency";
import { isVerifiedTaxSummaryStatus } from "../../../../lib/domain/receipt/tax/taxSummaryConsistency";

export type ReceiptTotalsStatus = "matched" | "mismatch" | "subtotalUnavailable";

export type ReceiptTotalsViewModel = {
  status: ReceiptTotalsStatus;
  paidTotalYen?: number;
  paidTotalLabel: string;
  itemsNormalizedTotalYen: number;
  itemsNormalizedTotalLabel: string;
  itemsPrintedTotalYen: number;
  itemsPrintedTotalLabel: string;
  printedTotalLabel: string;
  receiptSubtotalYen?: number;
  receiptSubtotalLabel: string;
  subtotalRateLabel?: string;
  gapPaidVsItems?: number;
  gapItemsVsSubtotal?: number;
  gapPaidVsItemsNote?: string;
  gapItemsVsSubtotalNote?: string;
  guidanceLines: string[];
  unresolvedCount: number;
  showPanel: boolean;
  canBulkApplyTax: boolean;
  bulkTaxLabel?: string;
};

function parseReviewItemAmountYen(amountYen: string): number | undefined {
  if (amountYen.trim() === "") {
    return undefined;
  }
  const parsed = Number(amountYen);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sumItemsPrintedTotal(reviewItems: ReviewItemValues[]): number {
  return reviewItems.reduce((sum, item) => {
    if (item.taxResolutionStatus === "resolved" && item.printedAmountYen != null) {
      return sum + item.printedAmountYen;
    }
    const printed = item.printedAmountYen ?? parseReviewItemAmountYen(item.amountYen) ?? 0;
    return sum + printed;
  }, 0);
}

function sumItemsNormalizedTotal(reviewItems: ReviewItemValues[]): number {
  return reviewItems.reduce((sum, item) => {
    if (item.taxResolutionStatus === "resolved" && item.normalizedAmountYen != null) {
      return sum + item.normalizedAmountYen;
    }
    const fallback = parseReviewItemAmountYen(item.amountYen) ?? 0;
    return sum + fallback;
  }, 0);
}

function hasResolvedExternalTax(reviewItems: ReviewItemValues[]): boolean {
  return reviewItems.some(
    (item) =>
      item.taxResolutionStatus === "resolved" &&
      item.amountBasis === "tax_excluded" &&
      item.normalizedAmountYen != null &&
      item.printedAmountYen != null &&
      item.normalizedAmountYen !== item.printedAmountYen,
  );
}

function shouldShowPrintedAsTaxExcluded(
  reviewItems: ReviewItemValues[],
  taxSummaries?: AiExpenseDraft["taxSummaries"],
): boolean {
  const allItemsAreResolvedExternalTax =
    reviewItems.length > 0 &&
    reviewItems.every(
      (item) => item.taxResolutionStatus === "resolved" && item.amountBasis === "tax_excluded",
    );
  if (hasResolvedExternalTax(reviewItems) && allItemsAreResolvedExternalTax) {
    return true;
  }
  return (
    allItemsAreResolvedExternalTax &&
    Boolean(
      taxSummaries?.some(
        (summary) =>
          summary.taxMode === "external" && summary.taxableAmountBasis === "tax_excluded",
      ),
    )
  );
}

function resolveReceiptSubtotal(taxSummaries: AiExpenseDraft["taxSummaries"]): {
  subtotalYen?: number;
  rateLabel?: string;
} {
  if (!taxSummaries || taxSummaries.length === 0) {
    return {};
  }
  if (
    taxSummaries.some(
      (summary) => summary.status !== undefined && !isVerifiedTaxSummaryStatus(summary.status),
    )
  ) {
    return {};
  }
  const bases = new Set(taxSummaries.map((summary) => summary.taxableAmountBasis));
  if (bases.size !== 1 || bases.has("unknown")) {
    return {};
  }
  if (taxSummaries.length === 1) {
    const summary = taxSummaries[0];
    return {
      subtotalYen: summary.taxableAmountYen,
      rateLabel: `${summary.taxRatePercent}%${getTaxModeLabel(summary.taxMode)}`,
    };
  }
  const subtotalYen = taxSummaries.reduce((sum, s) => sum + s.taxableAmountYen, 0);
  return { subtotalYen, rateLabel: "税率別" };
}

function formatGapNote(gap: number, referenceLabel: string): string {
  const abs = formatYenAbs(gap);
  if (gap > 0) {
    return `${referenceLabel}より${abs}多い`;
  }
  if (gap < 0) {
    return `${referenceLabel}より${abs}少ない`;
  }
  return "";
}

function buildGuidanceLines(args: {
  gapPaidVsItems?: number;
  gapItemsVsSubtotal?: number;
  unresolvedCount: number;
  hasSubtotal: boolean;
  canBulkApplyTax: boolean;
}): string[] {
  const lines: string[] = [];
  const allMatched =
    (args.gapPaidVsItems === undefined || args.gapPaidVsItems === 0) &&
    (args.gapItemsVsSubtotal === undefined || args.gapItemsVsSubtotal === 0) &&
    args.unresolvedCount === 0;

  if (allMatched) {
    lines.push("金額は一致しています");
    return lines;
  }

  let unresolvedLine: string | undefined;
  if (args.unresolvedCount > 0) {
    unresolvedLine = args.canBulkApplyTax
      ? `${args.unresolvedCount}件の税率が未確定です。下の一括適用を試すか、金額を確認してください`
      : `${args.unresolvedCount}件の税率が未確定です。金額を確認してください`;
  }

  const otherLines: string[] = [];
  if (args.gapPaidVsItems !== undefined && args.gapPaidVsItems !== 0) {
    const abs = formatYenAbs(args.gapPaidVsItems);
    if (args.gapPaidVsItems > 0) {
      otherLines.push(`お支払いより${abs}不足しています`);
    } else {
      otherLines.push(`お支払いより${abs}超過しています`);
    }
  }

  if (args.hasSubtotal && args.gapItemsVsSubtotal !== undefined && args.gapItemsVsSubtotal !== 0) {
    const abs = formatYenAbs(args.gapItemsVsSubtotal);
    otherLines.push(`印字合計とレシート小計が${abs}ずれています。金額が怪しい行を確認してください`);
  }

  const maxOtherLines = unresolvedLine ? 1 : 2;
  return [...(unresolvedLine ? [unresolvedLine] : []), ...otherLines.slice(0, maxOtherLines)];
}

export function toReceiptTotalsViewModel(args: {
  reviewItems: ReviewItemValues[];
  paidTotalYen?: number;
  taxSummaries?: AiExpenseDraft["taxSummaries"];
}): ReceiptTotalsViewModel {
  const { reviewItems, paidTotalYen, taxSummaries } = args;
  const showPanel = reviewItems.length > 0;

  const itemsPrintedTotalYen = sumItemsPrintedTotal(reviewItems);
  const itemsNormalizedTotalYen = sumItemsNormalizedTotal(reviewItems);
  const showPrintedAsTaxExcluded = shouldShowPrintedAsTaxExcluded(reviewItems, taxSummaries);
  const { subtotalYen: receiptSubtotalYen, rateLabel: subtotalRateLabel } =
    resolveReceiptSubtotal(taxSummaries);

  const gapPaidVsItems =
    paidTotalYen !== undefined ? paidTotalYen - itemsNormalizedTotalYen : undefined;
  const gapItemsVsSubtotal =
    receiptSubtotalYen !== undefined ? itemsPrintedTotalYen - receiptSubtotalYen : undefined;

  const unresolvedCount = reviewItems.filter(
    (item) => buildTaxContextFromReviewItem(item).status === "unresolved",
  ).length;

  const canBulkApplyTax =
    (taxSummaries?.length ?? 0) === 1 &&
    unresolvedCount > 0 &&
    (taxSummaries![0].status === undefined ||
      isVerifiedTaxSummaryStatus(taxSummaries![0].status)) &&
    taxSummaries![0].taxMode !== "unknown" &&
    taxSummaries![0].taxMode !== "mixed";

  let bulkTaxLabel: string | undefined;
  if (canBulkApplyTax && taxSummaries?.[0]) {
    const summary = taxSummaries[0];
    bulkTaxLabel = `このレシートは「${summary.taxRatePercent}%・${getTaxModeLabel(summary.taxMode)}」と読み取りました`;
  }

  const hasSubtotal = receiptSubtotalYen !== undefined;
  const guidanceLines = buildGuidanceLines({
    gapPaidVsItems,
    gapItemsVsSubtotal,
    unresolvedCount,
    hasSubtotal,
    canBulkApplyTax,
  });

  const hasMismatch =
    (gapPaidVsItems !== undefined && gapPaidVsItems !== 0) ||
    (gapItemsVsSubtotal !== undefined && gapItemsVsSubtotal !== 0) ||
    unresolvedCount > 0;

  const status: ReceiptTotalsStatus = !hasSubtotal
    ? hasMismatch
      ? "mismatch"
      : "subtotalUnavailable"
    : hasMismatch
      ? "mismatch"
      : "matched";

  return {
    status,
    paidTotalYen,
    paidTotalLabel: formatYenLabel(paidTotalYen),
    itemsNormalizedTotalYen,
    itemsNormalizedTotalLabel: formatYenLabel(itemsNormalizedTotalYen),
    itemsPrintedTotalYen,
    itemsPrintedTotalLabel: formatYenLabel(itemsPrintedTotalYen),
    printedTotalLabel: showPrintedAsTaxExcluded ? "印字合計（税抜）" : "印字合計",
    receiptSubtotalYen,
    receiptSubtotalLabel: hasSubtotal ? formatYenLabel(receiptSubtotalYen) : "読み取れませんでした",
    subtotalRateLabel,
    gapPaidVsItems,
    gapItemsVsSubtotal,
    gapPaidVsItemsNote:
      gapPaidVsItems !== undefined && gapPaidVsItems !== 0
        ? formatGapNote(-gapPaidVsItems, "お支払い")
        : undefined,
    gapItemsVsSubtotalNote:
      gapItemsVsSubtotal !== undefined && gapItemsVsSubtotal !== 0
        ? formatGapNote(gapItemsVsSubtotal, "レシート小計")
        : undefined,
    guidanceLines,
    unresolvedCount,
    showPanel,
    canBulkApplyTax,
    bulkTaxLabel,
  };
}
