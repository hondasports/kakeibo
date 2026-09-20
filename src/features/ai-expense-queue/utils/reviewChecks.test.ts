import { describe, expect, it } from "vitest";
import type { ReceiptRawObservation } from "../../../../lib/domain/receipt/observations";
import type { ExtractedTaxSummary } from "../../../../lib/receiptTax/types";
import type { ReviewItemValues } from "../types/types";
import { buildAmountCheck, buildTaxRateCheck } from "./reviewChecks";

function resolvedItem(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
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

function summary(overrides: Partial<ExtractedTaxSummary> = {}): ExtractedTaxSummary {
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

function rawObservation(
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

describe("buildAmountCheck", () => {
  it("外税: 明細合計＝税抜小計 かつ 小計＋税額＝支払額 なら一致", () => {
    const check = buildAmountCheck({
      items: [resolvedItem()],
      paidTotalYen: 108,
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("matched");
    expect(check.variant).toBe("external");
    expect(check.printedSubtotalYen).toBe(100);
    expect(check.expectedPaidYen).toBe(108);
  });

  it("外税: 明細合計と税抜小計の差だけを報告する", () => {
    const check = buildAmountCheck({
      items: [resolvedItem({ printedAmountYen: 90, amountYen: "90" })],
      paidTotalYen: 108,
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("mismatch");
    expect(check.mismatchStep).toBe("itemsVsSubtotal");
    expect(check.differenceYen).toBe(-10);
  });

  it("外税: 小計は一致しても支払額がずれれば不一致", () => {
    const check = buildAmountCheck({
      items: [resolvedItem()],
      paidTotalYen: 200,
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("mismatch");
    expect(check.mismatchStep).toBe("subtotalTaxVsPaid");
    expect(check.differenceYen).toBe(-92);
  });

  it("内税サマリのみなら明細合計と支払額を直接比較する", () => {
    const check = buildAmountCheck({
      items: [
        resolvedItem({
          amountBasis: "tax_included",
          printedAmountYen: 1080,
          amountYen: "1080",
        }),
      ],
      paidTotalYen: 1080,
      taxSummaries: [
        summary({
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountYen: 1080,
          taxableAmountBasis: "tax_included",
          taxYen: 98,
        }),
      ],
    });
    expect(check.variant).toBe("direct");
    expect(check.status).toBe("matched");
  });

  it("サマリなしは明細合計と支払額の直接比較", () => {
    const check = buildAmountCheck({
      items: [resolvedItem({ printedAmountYen: 500, amountYen: "500" })],
      paidTotalYen: 500,
    });
    expect(check.variant).toBe("direct");
    expect(check.status).toBe("matched");
  });

  it("外税の税抜明細は税込正規化額で支払額と直接比較できる", () => {
    const check = buildAmountCheck({
      items: [
        resolvedItem({
          printedAmountYen: 100,
          amountYen: "100",
          normalizedAmountYen: 108,
          taxAllocationStatus: "allocated",
        }),
      ],
      paidTotalYen: 108,
      taxSummaries: [],
    });
    expect(check.status).toBe("matched");
  });

  it("支払額が未入力なら比較不能", () => {
    const check = buildAmountCheck({
      items: [resolvedItem()],
      paidTotalYen: undefined,
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("uncomparable");
    expect(check.reason).toContain("支払額");
  });

  it("明細なし・金額未確定は比較不能", () => {
    expect(
      buildAmountCheck({ items: [], paidTotalYen: 100 }).status,
    ).toBe("uncomparable");
    expect(
      buildAmountCheck({
        items: [resolvedItem({ printedAmountYen: undefined, amountYen: "" })],
        paidTotalYen: 100,
      }).status,
    ).toBe("uncomparable");
  });
});

describe("buildTaxRateCheck", () => {
  it("同一基準の明細合計が印字対象額と一致すれば一致", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem()],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("matched");
    expect(check.rows[0].currentYen).toBe(100);
    expect(check.rows[0].matchKind).toBe("exact");
  });

  it("サマリの順序を保ったまま税率ごとの行を返す", () => {
    const check = buildTaxRateCheck({
      items: [
        resolvedItem({ id: "a", printedAmountYen: 100, amountYen: "100" }),
        resolvedItem({
          id: "b",
          taxRatePercent: 10,
          printedAmountYen: 200,
          amountYen: "200",
        }),
      ],
      taxSummaries: [
        summary({ taxRatePercent: 10, taxableAmountYen: 200, taxYen: 20 }),
        summary({ taxableAmountYen: 100 }),
      ],
    });
    expect(check.rows.map((row) => row.taxRatePercent)).toEqual([10, 8]);
    expect(check.status).toBe("matched");
  });

  it("差額のみを報告し、原因は推測しない", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem({ printedAmountYen: 150, amountYen: "150" })],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("mismatch");
    expect(check.rows[0].differenceYen).toBe(50);
    expect(check.rows[0].reason).toBeUndefined();
  });

  it("直接印字の証拠がある対象額は±1円でも不一致", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem({ printedAmountYen: 101, amountYen: "101" })],
      taxSummaries: [summary()],
      rawObservation: rawObservation([
        { rawText: "8%対象 100", amountYen: 100, lineRoleCandidates: ["tax"] },
      ]),
    });
    expect(check.status).toBe("mismatch");
    expect(check.rows[0].differenceYen).toBe(1);
  });

  it("直接印字の証拠がない対象額は±1円を近似一致として扱う", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem({ printedAmountYen: 101, amountYen: "101" })],
      taxSummaries: [summary()],
      rawObservation: rawObservation([
        { rawText: "合計 1,080", amountYen: 1080, lineRoleCandidates: ["total"] },
      ]),
    });
    expect(check.status).toBe("matched");
    expect(check.rows[0].matchKind).toBe("approx");
    expect(check.rows[0].differenceYen).toBe(1);
  });

  it("rawObservation が無い下書きも±1円を近似一致として扱う", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem({ printedAmountYen: 101, amountYen: "101" })],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("matched");
    expect(check.rows[0].matchKind).toBe("approx");
  });

  it("±2円の差は証拠の有無に関わらず不一致", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem({ printedAmountYen: 102, amountYen: "102" })],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("mismatch");
  });

  it("割引は対象商品の税率バケットに印字額を集計する", () => {
    const check = buildTaxRateCheck({
      items: [
        resolvedItem({ id: "p1", taxRatePercent: 8 }),
        resolvedItem({
          id: "d1",
          itemName: "値引",
          lineType: "discount",
          discountTargetItemId: "p1",
          printedAmountYen: -20,
          amountYen: "-20",
        }),
      ],
      taxSummaries: [summary({ taxableAmountYen: 80 })],
    });
    expect(check.status).toBe("matched");
    expect(check.rows[0].currentYen).toBe(80);
  });

  it("同じ商品を対象にする複数割引をすべて集計する", () => {
    const check = buildTaxRateCheck({
      items: [
        resolvedItem({ id: "p1", taxRatePercent: 8 }),
        resolvedItem({
          id: "d1",
          itemName: "値引1",
          lineType: "discount",
          discountTargetItemId: "p1",
          printedAmountYen: -10,
          amountYen: "-10",
        }),
        resolvedItem({
          id: "d2",
          itemName: "値引2",
          lineType: "discount",
          discountTargetItemId: "p1",
          printedAmountYen: -10,
          amountYen: "-10",
        }),
      ],
      taxSummaries: [summary({ taxableAmountYen: 80 })],
    });
    expect(check.status).toBe("matched");
    expect(check.rows[0].currentYen).toBe(80);
  });

  it("割引対象が未確定なら全体を比較不能にする", () => {
    const check = buildTaxRateCheck({
      items: [
        resolvedItem({ id: "p1" }),
        resolvedItem({
          id: "d1",
          itemName: "値引",
          lineType: "discount",
          printedAmountYen: -20,
          amountYen: "-20",
        }),
      ],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("uncomparable");
    expect(check.reason).toContain("割引対象");
  });

  it("税率未確定の明細があると全体を比較不能にする", () => {
    const check = buildTaxRateCheck({
      items: [
        resolvedItem({ id: "p1" }),
        resolvedItem({
          id: "u1",
          taxResolutionStatus: "unresolved",
          taxRatePercent: null,
          amountBasis: "unknown",
          taxResolutionSource: undefined,
        }),
      ],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("uncomparable");
    expect(check.rows[0].reason).toContain("未確定");
  });

  it("対象額の税込／税抜が未確定ならその行だけ比較不能", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem()],
      taxSummaries: [
        summary({ taxableAmountBasis: "unknown", taxMode: "unknown" }),
      ],
    });
    expect(check.status).toBe("uncomparable");
    expect(check.rows[0].reason).toContain("税込／税抜");
  });

  it("対象額が税抜なのに税込明細を含む行は比較不能", () => {
    const check = buildTaxRateCheck({
      items: [resolvedItem({ amountBasis: "tax_included" })],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("uncomparable");
    expect(check.rows[0].reason).toContain("基準が異なる");
  });

  it("サマリに無い税率の明細は未確定行として追加する", () => {
    const check = buildTaxRateCheck({
      items: [
        resolvedItem({ id: "a" }),
        resolvedItem({ id: "b", taxRatePercent: 10, printedAmountYen: 200 }),
      ],
      taxSummaries: [summary()],
    });
    expect(check.status).toBe("uncomparable");
    const extra = check.rows.find((row) => row.taxRatePercent === 10);
    expect(extra?.printedYen).toBeUndefined();
    expect(extra?.currentYen).toBe(200);
    expect(extra?.reason).toContain("印字の対象額");
  });

  it("サマリなしは比較不能で行も出さない", () => {
    const check = buildTaxRateCheck({ items: [resolvedItem()], taxSummaries: [] });
    expect(check.status).toBe("uncomparable");
    expect(check.rows).toEqual([]);
  });
});
