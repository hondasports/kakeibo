import { describe, expect, it } from "vitest";
import type { ReviewItemValues } from "../types/types";
import { toReceiptTotalsViewModel } from "./receiptTotalsViewModel";

function item(printedAmountYen: number, unresolved = true): ReviewItemValues {
  return {
    id: `item-${printedAmountYen}`,
    itemName: "商品",
    amountYen: String(printedAmountYen),
    categoryId: "cat1",
    printedAmountYen,
    taxResolutionStatus: unresolved ? "unresolved" : "resolved",
    taxRatePercent: unresolved ? null : 8,
    amountBasis: unresolved ? "unknown" : "tax_excluded",
    taxResolutionSource: unresolved ? undefined : "single_summary",
  };
}

describe("toReceiptTotalsViewModel", () => {
  it("石守相当: 8562 / 7958 / 7928 の差分と案内を返す", () => {
    const reviewItems = Array.from({ length: 32 }, (_, index) =>
      item(index === 0 ? 7958 - 31 * 100 : 100),
    );
    reviewItems[0] = item(7958 - 31 * 100);

    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 8562,
      reviewItems: [item(4000), item(3928), item(30)],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 7928,
          taxableAmountBasis: "tax_excluded",
          taxYen: 634,
          roundingMethod: "unknown",
          warnings: [],
          status: "contradictory",
        },
      ],
    });

    expect(vm.itemsPrintedTotalYen).toBe(7958);
    expect(vm.itemsNormalizedTotalYen).toBe(7958);
    expect(vm.gapPaidVsItems).toBe(604);
    expect(vm.gapItemsVsSubtotal).toBeUndefined();
    expect(vm.status).toBe("mismatch");
    expect(vm.guidanceLines[0]).toContain("件の税率が未確定");
    expect(vm.guidanceLines[1]).toBe("お支払いより604円不足しています");
    expect(vm.canBulkApplyTax).toBe(false);
    expect(vm.bulkTaxLabel).toBeUndefined();
  });

  it("一致時は matched と案内1行", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 1060,
      reviewItems: [
        {
          id: "1",
          itemName: "商品",
          amountYen: "1060",
          categoryId: "cat1",
          printedAmountYen: 1060,
          taxResolutionStatus: "resolved",
          taxRatePercent: 10,
          amountBasis: "tax_included",
          taxResolutionSource: "single_summary",
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountYen: 1060,
          taxableAmountBasis: "tax_included",
          taxYen: 96,
          roundingMethod: "unknown",
          warnings: [],
        },
      ],
    });

    expect(vm.status).toBe("matched");
    expect(vm.itemsNormalizedTotalYen).toBe(1060);
    expect(vm.guidanceLines).toEqual(["金額は一致しています"]);
    expect(vm.canBulkApplyTax).toBe(false);
  });

  it("taxSummaries なしは小計 unavailable", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 500,
      reviewItems: [item(500, false)],
      taxSummaries: undefined,
    });

    expect(vm.receiptSubtotalLabel).toBe("読み取れませんでした");
    expect(vm.gapItemsVsSubtotal).toBeUndefined();
    expect(vm.status).toBe("subtotalUnavailable");
  });

  it("外税確定明細は登録合計でお支払いと照合し、印字合計で小計と照合する", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 108,
      reviewItems: [
        {
          id: "1",
          itemName: "商品",
          amountYen: "100",
          categoryId: "cat1",
          printedAmountYen: 100,
          normalizedAmountYen: 108,
          taxResolutionStatus: "resolved",
          taxRatePercent: 8,
          amountBasis: "tax_excluded",
          taxResolutionSource: "single_summary",
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          roundingMethod: "unknown",
          warnings: [],
        },
      ],
    });

    expect(vm.itemsPrintedTotalYen).toBe(100);
    expect(vm.itemsNormalizedTotalYen).toBe(108);
    expect(vm.gapPaidVsItems).toBe(0);
    expect(vm.gapItemsVsSubtotal).toBe(0);
    expect(vm.printedTotalLabel).toBe("印字合計（税抜）");
    expect(vm.status).toBe("matched");
    expect(vm.guidanceLines).toEqual(["金額は一致しています"]);
  });

  it("未確定・差分・小計ずれが同時でも未確定案内を優先表示する", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 2000,
      reviewItems: [item(500), item(500)],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 900,
          taxableAmountBasis: "tax_excluded",
          taxYen: 72,
          roundingMethod: "unknown",
          warnings: [],
        },
      ],
    });

    expect(vm.guidanceLines).toHaveLength(2);
    expect(vm.guidanceLines[0]).toContain("件の税率が未確定");
    expect(vm.guidanceLines[1]).toMatch(/お支払いより|印字合計とレシート小計/);
  });

  it("空の金額入力は合計に 0 として数えない", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 100,
      reviewItems: [
        {
          id: "1",
          itemName: "商品",
          amountYen: "",
          categoryId: "cat1",
          taxResolutionStatus: "unresolved",
        },
      ],
    });

    expect(vm.itemsPrintedTotalYen).toBe(0);
    expect(vm.itemsNormalizedTotalYen).toBe(0);
  });

  it("外税サマリのみでも印字合計ラベルに税抜を付ける", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 108,
      reviewItems: [
        {
          id: "1",
          itemName: "商品",
          amountYen: "100",
          categoryId: "cat1",
          printedAmountYen: 100,
          normalizedAmountYen: 100,
          taxResolutionStatus: "resolved",
          taxRatePercent: 8,
          amountBasis: "tax_excluded",
          taxResolutionSource: "single_summary",
        },
      ],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          roundingMethod: "unknown",
          warnings: [],
        },
      ],
    });

    expect(vm.printedTotalLabel).toBe("印字合計（税抜）");
  });

  it("内税と外税が混在する場合は印字合計を税抜と表示しない", () => {
    const external: ReviewItemValues = {
      ...item(100, false),
      normalizedAmountYen: 108,
    };
    const included: ReviewItemValues = {
      ...item(110, false),
      id: "included",
      amountBasis: "tax_included",
      taxRatePercent: 10,
      normalizedAmountYen: 110,
    };

    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 218,
      reviewItems: [external, included],
    });

    expect(vm.printedTotalLabel).toBe("印字合計");
  });

  it("内税・外税で基準が異なる課税対象額を単純合算しない", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 218,
      reviewItems: [item(100), item(110)],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          roundingMethod: "unknown",
          warnings: [],
          status: "verified",
        },
        {
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountYen: 110,
          taxableAmountBasis: "tax_included",
          taxYen: 10,
          roundingMethod: "unknown",
          warnings: [],
          status: "verified",
        },
      ],
    });

    expect(vm.receiptSubtotalYen).toBeUndefined();
    expect(vm.gapItemsVsSubtotal).toBeUndefined();
    expect(vm.receiptSubtotalLabel).toBe("読み取れませんでした");
  });

  it("同一税率で競合するサマリは同じ基準でも小計に使わない", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 108,
      reviewItems: [item(100)],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 8,
          roundingMethod: "unknown",
          warnings: [],
          status: "contradictory",
        },
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 90,
          taxableAmountBasis: "tax_excluded",
          taxYen: 7,
          roundingMethod: "unknown",
          warnings: [],
          status: "contradictory",
        },
      ],
    });

    expect(vm.receiptSubtotalYen).toBeUndefined();
    expect(vm.canBulkApplyTax).toBe(false);
  });

  it("外税と未確定が混在する場合は印字合計を税抜と表示しない", () => {
    const external: ReviewItemValues = {
      ...item(100, false),
      normalizedAmountYen: 108,
    };
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 208,
      reviewItems: [external, item(100)],
    });

    expect(vm.printedTotalLabel).toBe("印字合計");
  });

  it("明細なしはパネル非表示", () => {
    const vm = toReceiptTotalsViewModel({
      paidTotalYen: 1000,
      reviewItems: [],
    });

    expect(vm.showPanel).toBe(false);
  });
});
