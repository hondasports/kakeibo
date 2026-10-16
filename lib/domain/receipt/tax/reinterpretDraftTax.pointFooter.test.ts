import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { pointFooterReceipt, receiptLine } from "./fixtures/pointFooterReceipt";
import type { ReceiptRawObservationLine } from "../observations";

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

  it.each(["今回お買上げポイント 9P", "今回合計付与ポイント 9P"])(
    "%s の1行だけでも税集計を矛盾扱いにしない",
    (rawText) => {
      const input = withLines((lines) =>
        lines
          .filter((line) => line.sourceLineIndex < 16)
          .concat(receiptLine(16, rawText, null, "unknown", "9P")),
      );
      expect(statuses(input)).toEqual({
        summaries: [
          [10, "verified"],
          [8, "verified"],
        ],
        allocated: true,
      });
    },
  );

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
    ["支払合計と異なる", 2500, "¥2,500"],
    ["金額が読めない", null, null],
  ] as const)("実際の合計行の金額が%s場合は矛盾として止める", (_, amountYen, amountText) => {
    const input = withLines((lines) =>
      lines.map((line) =>
        line.sourceLineIndex === 13
          ? receiptLine(
              13,
              amountYen === null ? "合計" : `合計 ${amountText}`,
              amountYen,
              "total",
              amountText,
            )
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
  });
});
