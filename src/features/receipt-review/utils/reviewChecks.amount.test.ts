import { describe, expect, it } from "vitest";
import { buildAmountCheck } from "./reviewAmountChecks";
import { resolvedItem, summary } from "./reviewChecksTestHelpers";

describe("buildAmountCheck", () => {
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

    it("内税サマリに税抜明細が混在する場合は基準矛盾として比較不能にする", () => {
      const check = buildAmountCheck({
        items: [
          resolvedItem({
            id: "conflict-1",
            taxRatePercent: 10,
            amountBasis: "tax_excluded",
            printedAmountYen: 636,
            amountYen: "636",
          }),
        ],
        paidTotalYen: 636,
        taxSummaries: [
          summary({
            taxRatePercent: 10,
            taxMode: "included",
            taxableAmountYen: 636,
            taxableAmountBasis: "tax_included",
            taxYen: 58,
          }),
        ],
      });
      expect(check).toMatchObject({
        status: "uncomparable",
        blockerCode: "basis-conflict",
        affectedItemIds: ["conflict-1"],
        focusTarget: "conflict-1",
      });
      expect(check.reason).toContain("一致していません");
    });

    it("内税表記と税抜対象額が矛盾していても税額を支払額へ加算しない", () => {
      const check = buildAmountCheck({
        items: [
          resolvedItem({
            amountBasis: "unknown",
            taxResolutionStatus: "unresolved",
            taxRatePercent: null,
            printedAmountYen: 3651,
            amountYen: "3651",
          }),
        ],
        paidTotalYen: 3651,
        taxSummaries: [
          summary({
            taxMode: "included",
            taxableAmountYen: 3458,
            taxableAmountBasis: "tax_excluded",
            taxYen: 328,
          }),
        ],
      });
      expect(check.variant).toBe("direct");
      expect(check.status).toBe("uncomparable");
      expect(check.expectedPaidYen).toBeUndefined();
    });

    it("サマリなしは明細合計と支払額の直接比較", () => {
      const check = buildAmountCheck({
        items: [
          resolvedItem({
            amountBasis: "tax_included",
            printedAmountYen: 500,
            amountYen: "500",
          }),
        ],
        paidTotalYen: 500,
      });
      expect(check.variant).toBe("direct");
      expect(check.status).toBe("matched");
    });

    it("税解釈を通っていない明細（amountBasis未設定）は印字額で直接比較する", () => {
      const check = buildAmountCheck({
        items: [
          {
            id: "item-1",
            itemName: "商品",
            amountYen: "500",
            categoryId: "cat1",
            printedAmountYen: 500,
          },
        ],
        paidTotalYen: 500,
      });
      expect(check.variant).toBe("direct");
      expect(check.status).toBe("matched");
    });

    it("未配分の税抜明細は印字額を税込比較額として使わず比較不能にする", () => {
      const check = buildAmountCheck({
        items: [
          resolvedItem({
            amountBasis: "tax_excluded",
            printedAmountYen: 100,
            amountYen: "100",
            // normalizeAmounts は未配分でも normalizedAmountYen に印字額を入れる
            normalizedAmountYen: 100,
            taxAllocationStatus: "unallocated",
          }),
        ],
        paidTotalYen: 108,
      });
      expect(check.status).toBe("uncomparable");
      expect(check.reason).toContain("未確定");
      expect(check.focusTarget).toBe("item-1");
    });

    it("税込／税抜の基準が unknown の明細は支払額と比較不能にする", () => {
      const check = buildAmountCheck({
        items: [
          resolvedItem({
            amountBasis: "unknown",
            taxResolutionStatus: "unresolved",
            taxResolutionSource: undefined,
            printedAmountYen: 100,
            amountYen: "100",
          }),
        ],
        paidTotalYen: 100,
      });
      expect(check.status).toBe("uncomparable");
    });

    it("明細金額を空にした場合は以前の印字額にフォールバックしない", () => {
      const check = buildAmountCheck({
        items: [
          resolvedItem({
            amountBasis: "tax_included",
            amountYen: "",
            printedAmountYen: 100,
          }),
        ],
        paidTotalYen: 100,
      });
      expect(check.status).toBe("uncomparable");
      expect(check.reason).toContain("明細金額");
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
      expect(buildAmountCheck({ items: [], paidTotalYen: 100 }).status).toBe("uncomparable");
      expect(
        buildAmountCheck({
          items: [resolvedItem({ printedAmountYen: undefined, amountYen: "" })],
          paidTotalYen: 100,
        }).status,
      ).toBe("uncomparable");
    });
  });
});
