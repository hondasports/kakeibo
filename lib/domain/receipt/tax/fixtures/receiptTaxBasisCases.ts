import type { ReceiptTaxInput } from "../types";

/** Issue #890の金額を匿名化した回帰ケース。期待値は印字税額の既存按分規則で固定する。 */
export const receiptTaxBasisCases = [
  { amounts: [98, 138, 168], taxYen: 32, paidYen: 436, allocations: [8, 11, 13] },
  { amounts: [132, 108], taxYen: 19, paidYen: 259, allocations: [10, 9] },
  { amounts: [109, 78, 58], taxYen: 19, paidYen: 264, allocations: [8, 6, 5] },
];

export function receiptTaxBasisInput(
  testCase: (typeof receiptTaxBasisCases)[number],
): ReceiptTaxInput {
  return {
    amountYen: testCase.paidYen,
    receiptTotalSource: "explicit_label",
    items: testCase.amounts.map((printedAmountYen, index) => ({
      itemName: `商品${index + 1}`,
      printedAmountYen,
      taxRatePercent: 8,
      amountBasis: "tax_excluded",
      markers: [],
      warnings: [],
    })),
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "included",
        taxableAmountYen: testCase.paidYen,
        taxableAmountBasis: "tax_included",
        taxYen: testCase.taxYen,
        taxIncludedAmountYen: testCase.paidYen,
        roundingMethod: "floor",
        confidence: {},
        warnings: [],
      },
    ],
  };
}
