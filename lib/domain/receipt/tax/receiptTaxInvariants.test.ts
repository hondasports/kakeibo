import { describe, expect, it } from "vitest";
import { interpretReceiptTax } from "./interpretReceiptTax";
import type { ExtractedReceiptItem, ExtractedTaxSummary, ReceiptTaxInput } from "./types";
import { receiptTaxBasisCases, receiptTaxBasisInput } from "./fixtures/receiptTaxBasisCases";
import { EXPENSE_ENTRY_AMOUNT_MAX } from "../../expenseEntries/expenseEntryItem";

function item(overrides: Partial<ExtractedReceiptItem> = {}): ExtractedReceiptItem {
  return {
    itemName: "item",
    printedAmountYen: 100,
    amountBasis: "unknown",
    taxRatePercent: null,
    markers: [],
    taxMarker: undefined,
    categoryName: undefined,
    quantity: 1,
    unitPriceYen: undefined,
    warnings: [],
    ...overrides,
  };
}

function summary(overrides: Partial<ExtractedTaxSummary> = {}): ExtractedTaxSummary {
  return {
    taxRatePercent: 10,
    taxMode: "included",
    taxableAmountYen: 100,
    taxableAmountBasis: "tax_included",
    taxYen: 10,
    taxIncludedAmountYen: 100,
    roundingMethod: "unknown",
    confidence: {},
    warnings: [],
    ...overrides,
  };
}

function input(overrides: Partial<ReceiptTaxInput> = {}): ReceiptTaxInput {
  return {
    amountYen: 100,
    items: [item()],
    taxSummaries: [summary()],
    markerDefinitions: [],
    ...overrides,
  };
}

describe("receiptTax invariants", () => {
  it("範囲外の明細を含む税額は未配分に保ち、印字金額を保存する", () => {
    const amounts = [EXPENSE_ENTRY_AMOUNT_MAX + 1, 100, -EXPENSE_ENTRY_AMOUNT_MAX - 1];
    const result = interpretReceiptTax(
      input({
        amountYen: 110,
        items: amounts.map((printedAmountYen) =>
          item({ printedAmountYen, amountBasis: "tax_excluded", taxRatePercent: 10 }),
        ),
        taxSummaries: [
          summary({
            taxMode: "external",
            taxableAmountBasis: "tax_excluded",
            taxIncludedAmountYen: 110,
          }),
        ],
      }),
    );
    expect(result.items.map((item) => item.printedAmountYen)).toEqual(amounts);
    expect(result.items.map((item) => item.normalizedAmountYen)).toEqual(amounts);
    expect(result.items.map((item) => item.taxAllocationStatus)).toEqual([
      "unallocated",
      "unallocated",
      "unallocated",
    ]);
    expect(result.items.every((item) => item.allocatedTaxYen === 0)).toBe(true);
  });

  it.each(receiptTaxBasisCases)(
    "基準が異なっても税額$taxYen 円と支払額$paidYen 円を保存する",
    (testCase) => {
      const result = interpretReceiptTax(receiptTaxBasisInput(testCase));
      expect(result.items.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(
        testCase.taxYen,
      );
      expect(result.items.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(
        testCase.paidYen,
      );
      for (const item of result.items) {
        expect(item.normalizedAmountYen).toBe(item.printedAmountYen + item.allocatedTaxYen);
      }
    },
  );

  it("外税: normalizedAmountYen === printedAmountYen + allocatedTaxYen", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 110,
        items: [item({ printedAmountYen: 100 })],
        taxSummaries: [
          summary({
            taxMode: "external",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_excluded",
            taxYen: 10,
            taxIncludedAmountYen: 110,
          }),
        ],
      }),
    );
    const interpreted = result.items[0];
    expect(interpreted.amountBasis).toBe("tax_excluded");
    expect(interpreted.normalizedAmountYen).toBe(
      interpreted.printedAmountYen + interpreted.allocatedTaxYen,
    );
  });

  it("内税: normalizedAmountYen === printedAmountYen", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 100,
        items: [item({ printedAmountYen: 100 })],
        taxSummaries: [
          summary({
            taxMode: "included",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_included",
            taxYen: 10,
            taxIncludedAmountYen: 100,
          }),
        ],
      }),
    );
    const interpreted = result.items[0];
    expect(interpreted.amountBasis).toBe("tax_included");
    expect(interpreted.normalizedAmountYen).toBe(interpreted.printedAmountYen);
  });

  it("税率別按分: sum(allocatedTaxYen) === summary.taxYen", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 326,
        items: [
          item({ printedAmountYen: 100, taxRatePercent: 10 }),
          item({ printedAmountYen: 200, taxRatePercent: 8 }),
        ],
        taxSummaries: [
          summary({
            taxRatePercent: 10,
            taxMode: "external",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_excluded",
            taxYen: 10,
            taxIncludedAmountYen: 110,
          }),
          summary({
            taxRatePercent: 8,
            taxMode: "external",
            taxableAmountYen: 200,
            taxableAmountBasis: "tax_excluded",
            taxYen: 16,
            taxIncludedAmountYen: 216,
          }),
        ],
      }),
    );
    const tax = result.items.reduce((sum, it) => sum + it.allocatedTaxYen, 0);
    const total = result.items.reduce((sum, it) => sum + it.printedAmountYen, 0);
    expect(tax).toBe(26);
    expect(result.items[0].allocatedTaxYen).toBe(10);
    expect(result.items[1].allocatedTaxYen).toBe(16);
    expect(total + tax).toBe(326);
  });

  it("完全解決済みレシート: sum(normalizedAmountYen) === amountYen", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 326,
        items: [
          item({ printedAmountYen: 100, taxRatePercent: 10 }),
          item({ printedAmountYen: 200, taxRatePercent: 8 }),
        ],
        taxSummaries: [
          summary({
            taxRatePercent: 10,
            taxMode: "external",
            taxableAmountYen: 100,
            taxableAmountBasis: "tax_excluded",
            taxYen: 10,
            taxIncludedAmountYen: 110,
          }),
          summary({
            taxRatePercent: 8,
            taxMode: "external",
            taxableAmountYen: 200,
            taxableAmountBasis: "tax_excluded",
            taxYen: 16,
            taxIncludedAmountYen: 216,
          }),
        ],
      }),
    );
    const normalizedTotal = result.items.reduce((sum, it) => sum + it.normalizedAmountYen, 0);
    expect(normalizedTotal).toBe(326);
  });

  it("unresolved safety: unresolved item does not receive allocated tax", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 100,
        items: [item({ printedAmountYen: 100, taxRatePercent: null })],
        taxSummaries: [
          summary({
            taxMode: "external",
            taxableAmountYen: 999,
            taxableAmountBasis: "tax_excluded",
            taxYen: 0,
            taxIncludedAmountYen: 100,
          }),
        ],
      }),
    );
    const interpreted = result.items[0];
    expect(interpreted.taxContext.status).toBe("unresolved");
    expect(interpreted.allocatedTaxYen).toBe(0);
    expect(interpreted.normalizedAmountYen).toBe(interpreted.printedAmountYen);
  });

  it("deterministic: same input yields same output", () => {
    const args = input({
      amountYen: 330,
      items: [
        item({ printedAmountYen: 100, taxRatePercent: 10 }),
        item({ printedAmountYen: 200, taxRatePercent: 8 }),
      ],
      taxSummaries: [
        summary({
          taxRatePercent: 10,
          taxMode: "external",
          taxableAmountYen: 100,
          taxableAmountBasis: "tax_excluded",
          taxYen: 10,
          taxIncludedAmountYen: 110,
        }),
        summary({
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 200,
          taxableAmountBasis: "tax_excluded",
          taxYen: 16,
          taxIncludedAmountYen: 216,
        }),
      ],
    });
    const a = interpretReceiptTax(args);
    const b = interpretReceiptTax(args);
    expect(a).toEqual(b);
  });
});

it("再計算した対象額でも税額配分と登録合計を保存する", async () => {
  const { reinterpretDraftTax } = await import("./reinterpretDraftTax");
  const { unprovenTargetReceipt } = await import("./fixtures/unprovenTargetReceipt");
  const result = reinterpretDraftTax(unprovenTargetReceipt());
  expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(437);
  expect(result.itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(4810);
});

it("導出結果の再入力・順序変更でも印字証拠と商品合計を保存する", async () => {
  const { reinterpretDraftTax } = await import("./reinterpretDraftTax");
  const { unprovenTargetReceipt } = await import("./fixtures/unprovenTargetReceipt");
  const input = unprovenTargetReceipt();
  const original = structuredClone(input);
  let summaries = input.taxSummaries;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const result = reinterpretDraftTax({
      ...input,
      taxSummaries: summaries,
      items: cycle % 2 ? input.items.toReversed() : input.items,
    });
    summaries = result.interpretation.taxSummaries;
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(result.itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(4810);
    expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(437);
  }
  expect(input).toEqual(original);
});
