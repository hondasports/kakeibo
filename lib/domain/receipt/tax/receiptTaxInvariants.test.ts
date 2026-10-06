import { describe, expect, it } from "vitest";
import { interpretReceiptTax } from "./interpretReceiptTax";
import type { ExtractedReceiptItem, ExtractedTaxSummary, ReceiptTaxInput } from "./types";
import { receiptTaxBasisCases, receiptTaxBasisInput } from "./fixtures/receiptTaxBasisCases";

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
