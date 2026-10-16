import type { ReinterpretDraftTaxInput } from "../reinterpretDraftTax";
import type { ReceiptRawObservationLine } from "../../observations";

type Role = ReceiptRawObservationLine["lineRoleCandidates"][number];

export function receiptLine(
  sourceLineIndex: number,
  rawText: string,
  amountYen: number | null,
  role: Role,
  amountText: string | null = amountYen === null ? null : `¥${amountYen.toLocaleString("ja-JP")}`,
): ReceiptRawObservationLine {
  return {
    sourceLineIndex,
    rawText,
    amountYen,
    amountText,
    lineRoleCandidates: [role],
    roleConfidence: 0.9,
    explicitlyPrinted: true,
  };
}

/**
 * Issue #1042 の本番観測と同じ構造・行の役割で作った合成データ。商品名・金額は実データと無関係。
 * 10%と8%の混在、割引2行、末尾のポイント行（amountYen: null、amountText は `9P` 形式）を含む。
 */
export function pointFooterReceipt(): ReinterpretDraftTaxInput {
  const confirmed = {
    amountBasis: "tax_included",
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
    taxConfirmedFields: ["amountBasis", "taxRatePercent"],
  } as const;
  return {
    amountYen: 2508,
    receiptTotalSource: "explicit_label",
    items: [
      { ...confirmed, itemName: "商品A", printedAmountYen: 500, taxRatePercent: 10 },
      { ...confirmed, itemName: "商品B", printedAmountYen: 108, taxRatePercent: 8 },
      { ...confirmed, itemName: "商品C", printedAmountYen: 1100, taxRatePercent: 10 },
      {
        ...confirmed,
        itemName: "クーポン割引 10%",
        lineType: "discount",
        printedAmountYen: -100,
        taxRatePercent: 10,
      },
      { ...confirmed, itemName: "商品D", printedAmountYen: 1000, taxRatePercent: 10 },
      {
        ...confirmed,
        itemName: "クーポン割引 10%",
        lineType: "discount",
        printedAmountYen: -100,
        taxRatePercent: 10,
      },
    ],
    taxSummaries: [
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountBasis: "tax_included",
        taxableAmountYen: 2400,
        taxYen: 218,
        taxIncludedAmountYen: 2400,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
      },
      {
        taxRatePercent: 8,
        taxMode: "included",
        taxableAmountBasis: "tax_included",
        taxableAmountYen: 108,
        taxYen: 8,
        taxIncludedAmountYen: 108,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [],
      },
    ],
    rawObservationLines: [
      receiptLine(0, "商品A", null, "item"),
      receiptLine(1, "単価 @250 2個 ¥500", 500, "item"),
      receiptLine(2, "商品B（軽） ¥108", 108, "item"),
      receiptLine(3, "商品C ¥1,100", 1100, "item"),
      receiptLine(4, "クーポン割引 10% -¥100", -100, "discount", "-¥100"),
      receiptLine(5, "商品D ¥1,000", 1000, "item"),
      receiptLine(6, "クーポン割引 10% -¥100", -100, "discount", "-¥100"),
      receiptLine(7, "小計 4点 ¥2,508", 2508, "subtotal"),
      receiptLine(8, "（内税対象額 10% ¥2,400）", 2400, "tax"),
      receiptLine(9, "（内税額 10% ¥218）", 218, "tax"),
      receiptLine(10, "（内税対象額 8% ¥108）", 108, "tax"),
      receiptLine(11, "（内税額 8% ¥8）", 8, "tax"),
      receiptLine(12, "（消費税計 ¥226）", 226, "tax"),
      receiptLine(13, "合計 ¥2,508", 2508, "total"),
      receiptLine(14, "電子マネー支払 ¥2,508", 2508, "payment"),
      receiptLine(15, "軽は軽減税率（8%）適用商品", null, "unknown"),
      receiptLine(16, "今回お買上げポイント 9P", null, "unknown", "9P"),
      receiptLine(17, "今回合計付与ポイント 9P", null, "unknown", "9P"),
      receiptLine(18, "累計ポイント 29P", null, "unknown", "29P"),
    ],
  };
}
