import type { ExtractedReceiptItem, ExtractedTaxSummary, ReceiptTaxInput } from "./types";

export const item = (
  amountBasis: ExtractedReceiptItem["amountBasis"] = "unknown",
  taxRatePercent: ExtractedReceiptItem["taxRatePercent"] = null,
): ExtractedReceiptItem => ({
  itemName: "商品",
  printedAmountYen: 1000,
  taxRatePercent,
  amountBasis,
  markers: [],
  warnings: [],
});

export const summary = (overrides: Partial<ExtractedTaxSummary> = {}): ExtractedTaxSummary => ({
  taxRatePercent: 10,
  taxMode: "included",
  taxableAmountYen: 1100,
  taxableAmountBasis: "tax_included",
  taxYen: 100,
  roundingMethod: "unknown",
  confidence: {},
  warnings: [],
  status: "verified",
  ...overrides,
});

export function line(
  rawText: string,
  amountYen: number | null,
  sourceLineIndex: number,
  role: "item" | "tax" | "fee" | "payment" = "tax",
) {
  return {
    rawText,
    amountText: amountYen === null ? null : `${amountYen}円`,
    amountYen,
    lineRoleCandidates: [role] as const,
    roleConfidence: 0.9,
    explicitlyPrinted: true,
    sourceLineIndex,
  };
}

export function classification(
  sourceLineIndex: number,
  role: "tax" | "fee" | "coupon" | "pointsUsed" | "paymentMethodAmount" | "change",
  evidence: string[] = [],
) {
  return {
    sourceLineIndex,
    status: "classified" as const,
    candidates: [{ role, score: 0.95, evidence }],
  };
}

export function baseInput(overrides: Partial<ReceiptTaxInput> = {}): ReceiptTaxInput {
  return {
    amountYen: 1100,
    items: [item("tax_included", 10)],
    taxSummaries: [summary()],
    ...overrides,
  };
}
