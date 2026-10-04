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
import { reinterpretDraftTax } from "../../../../lib/domain/receipt/tax/reinterpretDraftTax";
import { buildReviewChecks } from "./reviewChecks";
import { toReceiptTotalsViewModel } from "./receiptTotalsViewModel";

function duplicatedExternalInput(reverse = false) {
  const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
  const withIncluded = {
    ...input.taxSummaries[0],
    taxMode: "external" as const,
    taxableAmountBasis: "tax_excluded" as const,
    taxableAmountYen: 404,
  };
  const withoutIncluded = { ...withIncluded };
  delete withoutIncluded.taxIncludedAmountYen;
  input.taxSummaries = reverse ? [withIncluded, withoutIncluded] : [withoutIncluded, withIncluded];
  return input;
}

function previewReceipt(input: ReturnType<typeof duplicatedExternalInput>) {
  const { interpretation, itemFields } = reinterpretDraftTax(input);
  const sourceItems = input.items.map((item, index) =>
    resolvedItem({
      ...item,
      ...itemFields[index],
      id: `item-${index}`,
      amountYen: String(item.printedAmountYen),
    }),
  );
  return {
    taxSummaries: interpretation.taxSummaries,
    items: applyReviewItemsTaxPreview(sourceItems, {
      paidTotalYen: input.amountYen,
      taxSummaries: interpretation.taxSummaries,
    }),
  };
}

describe("Issue #890: 補正プレビューと確認結果", () => {
  it.each([false, true])(
    "同値の外税内訳2行でも金額・税率別確認が一致する（逆順=%s）",
    (reverse) => {
      const input = duplicatedExternalInput(reverse);
      const snapshot = structuredClone(input);
      const { items, taxSummaries } = previewReceipt(input);
      const checks = buildReviewChecks({ items, paidTotalYen: 436, taxSummaries });

      expect(items.map((item) => item.allocatedTaxYen)).toEqual([8, 11, 13]);
      expect(items.map((item) => item.normalizedAmountYen)).toEqual([106, 149, 181]);
      expect(checks.taxRate.status).toBe("matched");
      expect(checks.amount).toMatchObject({
        variant: "external",
        status: "matched",
        itemsPrintedTotalYen: 404,
        itemsComparableTotalYen: 436,
        printedSubtotalYen: 404,
        printedTaxYen: 32,
        expectedPaidYen: 436,
      });
      expect(taxSummaries).toHaveLength(2);
      expect(taxSummaries.map((summary) => summary.taxIncludedAmountYen)).toEqual(
        input.taxSummaries.map((summary) => summary.taxIncludedAmountYen),
      );
      expect(input).toEqual(snapshot);
    },
  );

  it.each([false, true])(
    "同値の外税内訳2行でも照合パネルの小計は404円になる（逆順=%s）",
    (reverse) => {
      const input = duplicatedExternalInput(reverse);
      const { items, taxSummaries } = previewReceipt(input);
      const snapshot = structuredClone(taxSummaries);
      const vm = toReceiptTotalsViewModel({ reviewItems: items, paidTotalYen: 436, taxSummaries });

      expect(vm).toMatchObject({
        status: "matched",
        receiptSubtotalYen: 404,
        itemsPrintedTotalYen: 404,
        itemsNormalizedTotalYen: 436,
        gapPaidVsItems: 0,
        gapItemsVsSubtotal: 0,
      });
      expect(vm.guidanceLines).toEqual(["金額は一致しています"]);
      expect(taxSummaries).toEqual(snapshot);
    },
  );

  it.each([
    { taxYen: 31, taxIncludedAmountYen: 435 },
    { taxableAmountYen: 403, taxIncludedAmountYen: 435 },
    { taxIncludedAmountYen: 437 },
  ])("異なる税額・対象額・矛盾する税込補助額は同値として隠さない（%o）", (changes) => {
    const input = duplicatedExternalInput();
    input.taxSummaries[1] = { ...input.taxSummaries[1], ...changes };
    const snapshot = structuredClone(input);
    const { items, taxSummaries } = previewReceipt(input);

    expect(buildReviewChecks({ items, paidTotalYen: 436, taxSummaries }).amount.status).not.toBe(
      "matched",
    );
    expect(
      toReceiptTotalsViewModel({ reviewItems: items, paidTotalYen: 436, taxSummaries }).status,
    ).not.toBe("matched");
    expect(taxSummaries).toHaveLength(2);
    expect(input).toEqual(snapshot);
  });

  it.each(["ambiguous", "contradictory"] as const)(
    "照合パネルは同値の行でも未検証の内訳を隠さない（%s）",
    (status) => {
      const input = duplicatedExternalInput();
      const { items } = previewReceipt(input);
      const taxSummaries = input.taxSummaries.map((summary, index) => ({
        ...summary,
        status: index === 1 ? status : ("verified" as const),
      }));
      const snapshot = structuredClone(taxSummaries);
      const vm = toReceiptTotalsViewModel({ reviewItems: items, paidTotalYen: 436, taxSummaries });

      expect(vm.receiptSubtotalYen).toBeUndefined();
      expect(vm.status).toBe("subtotalUnavailable");
      expect(vm.canBulkApplyTax).toBe(false);
      expect(taxSummaries).toEqual(snapshot);
    },
  );

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
