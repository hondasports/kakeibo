import type { ReinterpretDraftTaxInput } from "../reinterpretDraftTax";
import type { ReceiptRawObservationLine } from "../../observations";

export function observationLine(
  rawText: string,
  amountYen: number,
  sourceLineIndex: number,
): ReceiptRawObservationLine {
  return {
    rawText,
    amountYen,
    amountText: `${amountYen}円`,
    sourceLineIndex,
    explicitlyPrinted: true,
    lineRoleCandidates: ["tax"],
    roleConfidence: 1,
  };
}

/** Issue #1003 の観察値を匿名化。画像や実店舗・下書き識別子を含めない。 */
export function unprovenTargetReceipt(): ReinterpretDraftTaxInput {
  return {
    amountYen: 4810,
    receiptTotalSource: "explicit_label",
    items: [990, 1500, 1500, 790, 30].map((printedAmountYen, index) => ({
      itemName: `商品${index + 1}`,
      printedAmountYen,
      amountBasis: "tax_included",
      taxRatePercent: 10,
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      warnings: ["amount_mismatch"],
    })),
    taxSummaries: [
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountBasis: "tax_included",
        taxableAmountYen: 4373,
        taxYen: 437,
        taxIncludedAmountYen: 4810,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
      },
    ],
    rawObservationLines: [
      observationLine("合計 4,810円", 4810, 0),
      observationLine("内消費税10% 437円", 437, 1),
    ],
  };
}
