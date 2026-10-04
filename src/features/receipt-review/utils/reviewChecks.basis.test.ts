import { describe, expect, it } from "vitest";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../../../../lib/domain/receipt/tax/fixtures/receiptTaxBasisCases";
import { applyReviewItemsTaxPreview } from "./reviewItemsTaxPreview";
import { buildAmountCheck } from "./reviewAmountChecks";
import { buildTaxRateCheck } from "./reviewTaxChecks";
import { findBasisConflicts } from "./reviewCheckUtils";
import { resolvedItem, rawObservation } from "./reviewChecksTestHelpers";

describe("Issue #890: 補正プレビューと確認結果", () => {
  it.each(receiptTaxBasisCases)("税抜補正後は税込対象額$paidYen 円と一致する", (testCase) => {
    const input = receiptTaxBasisInput(testCase);
    const sourceItems = input.items.map((item, index) =>
      resolvedItem({
        ...item,
        id: `item-${index}`,
        amountYen: String(item.printedAmountYen),
        taxAllocationStatus: "unallocated",
        normalizedAmountYen: item.printedAmountYen,
      }),
    );
    const items = applyReviewItemsTaxPreview(sourceItems, {
      paidTotalYen: input.amountYen,
      taxSummaries: input.taxSummaries,
    });
    expect(items.map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
    expect(findBasisConflicts(items, input.taxSummaries)).toEqual([]);
    expect(
      buildAmountCheck({ items, paidTotalYen: input.amountYen, taxSummaries: input.taxSummaries }),
    ).toMatchObject({
      status: "matched",
      itemsComparableTotalYen: input.amountYen,
    });
    const check = buildTaxRateCheck({
      items,
      taxSummaries: input.taxSummaries,
      rawObservation: rawObservation([
        { rawText: `8%対象額 ${testCase.paidYen}`, amountYen: testCase.paidYen },
      ]),
    });
    expect(check).toMatchObject({
      status: "matched",
      rows: [
        {
          printedYen: testCase.paidYen,
          currentYen: testCase.paidYen,
          matchKind: "exact",
        },
      ],
    });
    expect(items.map((item) => item.amountYen)).toEqual(testCase.amounts.map(String));
    expect(sourceItems.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it("税抜内訳に対応する税込明細では支払額を直接比較する", () => {
    const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
    input.taxSummaries[0] = {
      ...input.taxSummaries[0],
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      taxableAmountYen: 404,
    };
    const items = applyReviewItemsTaxPreview(
      [106, 149, 181].map((amount, index) =>
        resolvedItem({
          id: `item-${index}`,
          amountBasis: "tax_included",
          printedAmountYen: amount,
          amountYen: String(amount),
        }),
      ),
      { paidTotalYen: 436, taxSummaries: input.taxSummaries },
    );
    expect(
      buildAmountCheck({ items, paidTotalYen: 436, taxSummaries: input.taxSummaries }),
    ).toMatchObject({ status: "matched", variant: "direct" });
    expect(buildTaxRateCheck({ items, taxSummaries: input.taxSummaries })).toMatchObject({
      status: "matched",
      rows: [{ printedYen: 404, currentYen: 404 }],
    });
  });

  it("換算後に1円ずれても近似一致で税額を確定しない", () => {
    const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
    input.items[0].printedAmountYen += 1;
    const items = applyReviewItemsTaxPreview(
      input.items.map((item, index) =>
        resolvedItem({
          ...item,
          id: `item-${index}`,
          amountYen: String(item.printedAmountYen),
        }),
      ),
      { paidTotalYen: 436, taxSummaries: input.taxSummaries },
    );
    expect(items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
    expect(
      buildAmountCheck({ items, paidTotalYen: 436, taxSummaries: input.taxSummaries }).status,
    ).toBe("uncomparable");
    expect(buildTaxRateCheck({ items, taxSummaries: input.taxSummaries }).status).toBe(
      "uncomparable",
    );
  });
});
