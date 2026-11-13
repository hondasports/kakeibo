import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { pointFooterReceipt, receiptLine } from "./fixtures/pointFooterReceipt";
import type { ReceiptRawObservationLine } from "../observations";
import { deriveReceiptTaxSummaries } from "./deriveReceiptTaxSummaries";
import { draftItemToExtractedReceiptItem } from "./draftTaxMapping";

function withLines(
  update: (lines: ReceiptRawObservationLine[]) => ReceiptRawObservationLine[],
): ReturnType<typeof pointFooterReceipt> {
  const input = pointFooterReceipt();
  return { ...input, rawObservationLines: update(input.rawObservationLines!) };
}

function statuses(input: ReturnType<typeof pointFooterReceipt>) {
  const result = reinterpretDraftTax(input);
  return {
    summaries: result.interpretation.taxSummaries.map((summary) => [
      summary.taxRatePercent,
      summary.status,
    ]),
    allocated: result.itemFields.every((item) => item.taxAllocationStatus === "allocated"),
  };
}

describe("レシート末尾のポイント行（Issue #1042）", () => {
  it("ポイント行があっても、確認済みの商品と印字税額が整合すれば全商品へ配分する", () => {
    const result = reinterpretDraftTax(pointFooterReceipt());
    expect(result.interpretation.taxSummaries).toMatchObject([
      { taxRatePercent: 10, status: "verified", taxableAmountYen: 2400, taxYen: 218 },
      { taxRatePercent: 8, status: "verified", taxableAmountYen: 108, taxYen: 8 },
    ]);
    expect(result.itemFields.map((item) => item.taxAllocationStatus)).toEqual(
      Array(6).fill("allocated"),
    );
    expect(result.itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(2508);
    expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(226);
  });

  it.each([
    ["今回お買上げポイント 9P", null, "9P"],
    ["今回合計付与ポイント 9P", null, "9P"],
    ["今回合計付与ポイント 9P（9円相当）", 9, "9円"],
  ] as const)("%s の1行だけでも税集計を矛盾扱いにしない", (rawText, amountYen, amountText) => {
    const input = withLines((lines) =>
      lines
        .filter((line) => line.sourceLineIndex < 16)
        .concat(receiptLine(16, rawText, amountYen, "unknown", amountText)),
    );
    expect(statuses(input)).toEqual({
      summaries: [
        [10, "verified"],
        [8, "verified"],
      ],
      allocated: true,
    });
  });

  it.each([
    ["今月購入金額合計 12,345円（税抜）", 12345, "12,345円"],
    ["今月購入金額合計 12,345円（税抜）", null, "12,345円（税抜）"],
    ["累計お買上金額 ¥30,000", 30000, "¥30,000"],
    ["年間お買上合計 ¥30,000", 30000, "¥30,000"],
  ] as const)(
    "期間累計の行 %s（amountYen: %s）を支払合計と比べない",
    (rawText, amountYen, amountText) => {
      const input = withLines((lines) => [
        ...lines,
        receiptLine(19, rawText, amountYen, "unknown", amountText),
      ]);
      expect(statuses(input).allocated).toBe(true);
    },
  );

  it.each([
    ["合計 ¥2,500", 2500, "¥2,500"],
    ["合計", null, null],
    ["ポイント利用後合計 2,500", 2500, "2,500"],
    ["合計（ポイント利用後）2,500", 2500, "2,500"],
  ] as const)(
    "実際の合計行 %s が支払合計と食い違う場合は矛盾として止める",
    (rawText, amountYen, amountText) => {
      const input = withLines((lines) =>
        lines.map((line) =>
          line.sourceLineIndex === 13
            ? receiptLine(13, rawText, amountYen, "total", amountText)
            : line,
        ),
      );
      expect(statuses(input)).toEqual({
        summaries: [
          [10, "contradictory"],
          [8, "contradictory"],
        ],
        allocated: false,
      });
    },
  );
});

describe("分離されたポイント額（Issue #1248）", () => {
  const input = {
    amountYen: 288,
    receiptTotalSource: "explicit_label" as const,
    items: [128, 160].map((amount, index) => ({
      itemName: `商品${index + 1}`,
      printedAmountYen: amount,
      amountBasis: "tax_included" as const,
      taxRatePercent: 8 as const,
      taxResolutionStatus: "resolved" as const,
      taxResolutionSource: "item_explicit" as const,
      taxConfirmedFields: ["amountBasis", "taxRatePercent"] as ("amountBasis" | "taxRatePercent")[],
    })),
    taxSummaries: [],
    rawObservationLines: [
      receiptLine(3, "ヤマザキ ミニクロワッサン 軽*", 128, "item"),
      receiptLine(4, "クーポン券ポイント", null, "unknown", "5倍"),
      receiptLine(5, "とんがりコーン 焼きと 軽*", 160, "item"),
      receiptLine(6, "クーポン券ポイント", null, "unknown", "5倍"),
      receiptLine(7, "小計 2点", 288, "subtotal"),
      receiptLine(8, "(内税対象額 8%", 288, "tax"),
      receiptLine(9, "(内税額 8%", 21, "tax"),
      receiptLine(10, "(消費税計", 21, "tax"),
      receiptLine(11, "合計", 288, "total"),
      receiptLine(12, "QUICPay", 288, "payment"),
      receiptLine(13, "QUICPay支払", 288, "payment"),
      receiptLine(14, "今回お買上げポイント", null, "unknown", "5P"),
    ],
  };

  it.each(["5P", "5pt(10%)"])("ポイント行 %s を合計矛盾にしない", (amountText) => {
    const summaries = deriveReceiptTaxSummaries({
      amountYen: input.amountYen,
      items: input.items.map(draftItemToExtractedReceiptItem),
      lines: input.rawObservationLines.map((line) =>
        line.sourceLineIndex === 14 ? { ...line, amountText } : line,
      ),
    });
    expect(summaries[0].warnings).not.toContain("contradictory_receipt_tax_evidence");
  });

  it.each(["5P", "5pt(10%)"])(
    "ポイント行 %s があっても確定した明細に印字税額を配分する",
    (amountText) => {
      const result = reinterpretDraftTax({
        ...input,
        rawObservationLines: input.rawObservationLines.map((line) =>
          line.sourceLineIndex === 14 ? { ...line, amountText } : line,
        ),
      });
      expect(result.itemFields.map((item) => item.taxAllocationStatus)).toEqual([
        "allocated",
        "allocated",
      ]);
      expect(result.itemFields.map((item) => item.allocatedTaxYen)).toEqual([9, 12]);
    },
  );

  it.each(["合計", "お買上合計"])("%s の金額が支払額と異なれば矛盾にする", (label) => {
    const lines = input.rawObservationLines.map((line) =>
      line.sourceLineIndex === 11 ? receiptLine(11, label, 287, "total") : line,
    );
    const summaries = deriveReceiptTaxSummaries({
      amountYen: input.amountYen,
      items: input.items.map(draftItemToExtractedReceiptItem),
      lines,
    });
    expect(summaries[0].warnings).toContain("contradictory_receipt_tax_evidence");
  });

  it.each(["¥288(5pt)", "288円(5P)", "¥288(5pt(10%))"])(
    "ポイント注記付き合計 %s の不一致は矛盾にする",
    (amountText) => {
      const lines = input.rawObservationLines.map((line) =>
        line.sourceLineIndex === 11
          ? receiptLine(11, "ポイント利用後合計", 287, "total", amountText)
          : line,
      );
      const summaries = deriveReceiptTaxSummaries({
        amountYen: input.amountYen,
        items: input.items.map(draftItemToExtractedReceiptItem),
        lines,
      });
      expect(summaries[0].warnings).toContain("contradictory_receipt_tax_evidence");
    },
  );
});
