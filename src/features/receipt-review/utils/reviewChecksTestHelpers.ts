import type { ReceiptRawObservation } from "../../../../lib/domain/receipt/observations";
import type { ExtractedTaxSummary } from "../../../../lib/receiptTax/types";
import type { ReviewItemValues } from "../types/types";

export function resolvedItem(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
  return {
    id: overrides.id ?? "item-1",
    itemName: "商品",
    amountYen: "100",
    categoryId: "cat1",
    printedAmountYen: 100,
    taxResolutionStatus: "resolved",
    taxRatePercent: 8,
    amountBasis: "tax_excluded",
    taxResolutionSource: "single_summary",
    ...overrides,
  };
}

export function summary(overrides: Partial<ExtractedTaxSummary> = {}): ExtractedTaxSummary {
  return {
    taxRatePercent: 8,
    taxMode: "external",
    taxableAmountYen: 100,
    taxableAmountBasis: "tax_excluded",
    taxYen: 8,
    roundingMethod: "unknown",
    warnings: [],
    confidence: {},
    status: "verified",
    ...overrides,
  };
}

export function rawObservation(
  lines: Partial<ReceiptRawObservation["lines"][number]>[],
): ReceiptRawObservation {
  return {
    source: "ai_ocr",
    observedAt: 0,
    lines: lines.map((line, index) => ({
      rawText: "8%対象 100",
      amountText: "100",
      amountYen: 100,
      lineRoleCandidates: ["tax"],
      roleConfidence: 0.9,
      explicitlyPrinted: true,
      sourceLineIndex: index,
      ...line,
    })),
  };
}
