import { describe, expect, it } from "vitest";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../receipt/tax/fixtures/receiptTaxBasisCases";
import { applyReviewItemsTaxPreview, buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { buildAmountCheck } from "./reviewAmountChecks";
import { buildTaxRateCheck } from "./reviewTaxChecks";
import { findBasisConflicts } from "./reviewCheckUtils";
import { resolvedItem, rawObservation } from "./reviewChecksTestHelpers";
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";
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
      sourceTaxSummaries: input.taxSummaries,
      rawObservation: input.rawObservationLines
        ? { source: "ai_ocr", observedAt: 0, lines: input.rawObservationLines }
        : undefined,
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
      expect(taxSummaries).toHaveLength(1);

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
    input.rawObservationLines = input.taxSummaries.flatMap((summary, index) => [
      {
        rawText: "8%税抜対象 " + summary.taxableAmountYen + "円",
        amountYen: summary.taxableAmountYen,
        amountText: String(summary.taxableAmountYen),
        sourceLineIndex: index * 2,
        explicitlyPrinted: true,
        lineRoleCandidates: ["tax"],
        roleConfidence: 1,
      },
      {
        rawText: "外税8% " + summary.taxYen + "円",
        amountYen: summary.taxYen,
        amountText: String(summary.taxYen),
        sourceLineIndex: index * 2 + 1,
        explicitlyPrinted: true,
        lineRoleCandidates: ["tax"],
        roleConfidence: 1,
      },
      ...(summary.taxIncludedAmountYen === undefined
        ? []
        : [
            {
              rawText: "8%税込合計 " + summary.taxIncludedAmountYen + "円",
              amountYen: summary.taxIncludedAmountYen,
              amountText: String(summary.taxIncludedAmountYen),
              sourceLineIndex: index * 2 + 10,
              explicitlyPrinted: true,
              lineRoleCandidates: ["tax" as const],
              roleConfidence: 1,
            },
          ]),
    ]);
    const snapshot = structuredClone(input);
    const { items, taxSummaries } = previewReceipt(input);

    expect(buildReviewChecks({ items, paidTotalYen: 436, taxSummaries }).taxRate.status).not.toBe(
      "matched",
    );
    expect(
      toReceiptTotalsViewModel({ reviewItems: items, paidTotalYen: 436, taxSummaries }).status,
    ).not.toBe("matched");
    expect(items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
    expect(taxSummaries).toHaveLength(1);
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
        taxResolutionSource: "item_explicit",
        normalizedAmountYen: item.printedAmountYen,
      }),
    );
    const { items, taxSummaries } = buildReviewTaxPreview(sourceItems, {
      paidTotalYen: input.amountYen,
      taxSummaries: input.taxSummaries,
    });
    expect(items.map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
    expect(findBasisConflicts(items, taxSummaries)).toEqual([]);
    expect(buildAmountCheck({ items, paidTotalYen: input.amountYen, taxSummaries })).toMatchObject({
      status: "matched",
      itemsComparableTotalYen: input.amountYen,
    });
    const check = buildTaxRateCheck({
      items,
      taxSummaries,
      rawObservation: rawObservation([
        { rawText: `8%税込対象額 ${testCase.paidYen}`, amountYen: testCase.paidYen },
      ]),
    });
    expect(check).toMatchObject({
      status: "matched",
      rows: [
        {
          printedYen: testCase.amounts.reduce((sum, amount) => sum + amount, 0),
          currentYen: testCase.amounts.reduce((sum, amount) => sum + amount, 0),
          matchKind: "exact",
        },
      ],
    });
    expect(items.map((item) => item.amountYen)).toEqual(testCase.amounts.map(String));
    expect(sourceItems.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it("確認済み税込明細は導出した税込対象額と支払額を直接比較する", () => {
    const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
    input.taxSummaries[0] = {
      ...input.taxSummaries[0],
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      taxableAmountYen: 404,
    };
    const { items, taxSummaries } = buildReviewTaxPreview(
      [106, 149, 181].map((amount, index) =>
        resolvedItem({
          id: `item-${index}`,
          amountBasis: "tax_included",
          taxResolutionSource: "item_explicit",
          printedAmountYen: amount,
          amountYen: String(amount),
        }),
      ),
      { paidTotalYen: 436, taxSummaries: input.taxSummaries },
    );
    expect(buildAmountCheck({ items, paidTotalYen: 436, taxSummaries })).toMatchObject({
      status: "matched",
      variant: "direct",
    });
    expect(buildTaxRateCheck({ items, taxSummaries })).toMatchObject({
      status: "matched",
      rows: [{ printedYen: 436, currentYen: 436 }],
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
