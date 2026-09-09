import type { ReinterpretDraftTaxInput } from "../reinterpretDraftTax";

/** Anonymous reproduction of #748: 13 printed lines, 4292 + 232 + 138 = 4662. */
export function unallocatedTaxReceipt(): ReinterpretDraftTaxInput {
  const amounts = [216, 398, 178, -40, 398, 376, 298, -60, -24, 398, 558, 1380, 216];
  return {
    amountYen: 4662,
    items: amounts.map((amount, index) => ({
      itemName: amount < 0 ? "割引" + (index + 1) : "商品" + (index + 1),
      printedAmountYen: amount,
      amountBasis: "tax_excluded",
      taxRatePercent: index === 11 ? 10 : index === 7 || index === 8 ? 0 : 8,
      allocatedTaxYen: 0,
      normalizedAmountYen: amount,
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
    })),
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "external",
        taxableAmountYen: 2912,
        taxableAmountBasis: "unknown",
        taxYen: 232,
        roundingMethod: "floor",
        confidence: {},
        warnings: [],
        status: "ambiguous",
      },
      {
        taxRatePercent: 10,
        taxMode: "external",
        taxableAmountYen: 1380,
        taxableAmountBasis: "unknown",
        taxYen: 138,
        roundingMethod: "floor",
        confidence: {},
        warnings: [],
        status: "ambiguous",
      },
    ],
  };
}
