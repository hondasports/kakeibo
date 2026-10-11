import { describe, expect, it } from "vitest";
import { interpretReceiptTax } from "./interpretReceiptTax";
import { normalizeTaxSummary } from "./taxSummaryConsistency";
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

describe("receiptTax corruption matrix", () => {
  it.each(["taxYen", "taxableAmountYen", "taxIncludedAmountYen"] as const)(
    "税込・税抜内訳の%s が矛盾すれば同値扱いしない",
    (field) => {
      const source = receiptTaxBasisInput(receiptTaxBasisCases[0]);
      const excluded = {
        ...source.taxSummaries[0],
        taxMode: "external" as const,
        taxableAmountBasis: "tax_excluded" as const,
        taxableAmountYen: 404,
      };
      excluded[field] = (excluded[field] ?? 436) + 1;
      source.taxSummaries.push(excluded);
      const result = interpretReceiptTax(source);
      expect(result.warnings).toContain("conflicting_tax_summary:8");
      expect(result.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
    },
  );

  it("AI誤読：included × tax_excluded + A + T != I を検出", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 1060,
        items: [item({ printedAmountYen: 1060 })],
        taxSummaries: [
          summary({
            taxMode: "included",
            taxableAmountYen: 960,
            taxableAmountBasis: "tax_excluded",
            taxYen: 96,
            taxIncludedAmountYen: 1060,
          }),
        ],
      }),
    );
    const s = result.taxSummaries[0];
    expect(s.status).toBe("contradictory");
    expect(s.reasons).toContain("included_mode_with_tax_excluded_basis");
    expect(s.reasons).toContain("tax_summary_amount_mismatch");
  });

  it("AI誤読：算術一致しても included を external へ自動変更しない", () => {
    const normalized = normalizeTaxSummary(
      summary({
        taxMode: "included",
        taxableAmountYen: 7928,
        taxableAmountBasis: "tax_included",
        taxYen: 634,
        taxIncludedAmountYen: 8562,
      }),
      8562,
    );
    expect(normalized.taxMode).toBe("included");
    expect(normalized.taxableAmountBasis).toBe("tax_included");
    expect(normalized.status).toBe("contradictory");
  });

  it("AI誤読：taxIncludedAmountYen だけ誤読（A = P だが I != P）", () => {
    const result = normalizeTaxSummary(
      summary({
        taxMode: "included",
        taxableAmountYen: 1060,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 960,
      }),
      1060,
    );
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("tax_included_amount_mismatch");
  });

  it("AI誤読：taxableAmountYen だけ誤読（A != P, I = P）", () => {
    const result = normalizeTaxSummary(
      summary({
        taxMode: "included",
        taxableAmountYen: 960,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
      }),
      1060,
    );
    expect(result.status).toBe("contradictory");
    expect(result.reasons).toContain("tax_summary_amount_mismatch");
  });

  it(" contradictory summary は processable から除外され金額按分に使われない", () => {
    const result = interpretReceiptTax(
      input({
        amountYen: 1060,
        items: [item({ printedAmountYen: 1060, taxRatePercent: 10 })],
        taxSummaries: [
          summary({
            taxMode: "included",
            taxableAmountYen: 960,
            taxableAmountBasis: "tax_excluded",
            taxYen: 96,
            taxIncludedAmountYen: 1060,
          }),
        ],
      }),
    );
    const interpreted = result.items[0];
    expect(interpreted.taxContext.status).toBe("unresolved");
    expect(interpreted.allocatedTaxYen).toBe(0);
    expect(interpreted.normalizedAmountYen).toBe(1060);
  });

  it("mixed tax mode は ambiguous として金額処理から除外する", () => {
    const result = normalizeTaxSummary(
      summary({
        taxMode: "mixed",
        taxableAmountYen: 1000,
        taxableAmountBasis: "tax_included",
        taxYen: 96,
        taxIncludedAmountYen: 1000,
      }),
      1000,
    );
    expect(result.status).toBe("ambiguous");
    expect(result.reasons).toContain("mixed_tax_mode");
  });
});

it.each([
  "tax",
  "total",
  "missing",
  "duplicate",
  "discount",
  "mixed",
  "unknown",
  "target",
  "rounding",
])("対象額再計算は%sの証拠不足・矛盾を隠さない", async (corruption) => {
  const { reinterpretDraftTax } = await import("./reinterpretDraftTax");
  const { unprovenTargetReceipt, observationLine } =
    await import("./fixtures/unprovenTargetReceipt");
  const input = unprovenTargetReceipt();
  if (corruption === "tax") input.rawObservationLines![1].amountYen = 400;
  if (corruption === "total") input.rawObservationLines![0].amountYen = 4800;
  if (corruption === "missing") input.items.pop();
  if (corruption === "duplicate") input.items.push(input.items[0]);
  if (corruption === "discount") input.items[0].printedAmountYen = -990;
  if (corruption === "mixed") input.items[0].taxRatePercent = 8;
  if (corruption === "unknown") input.rawObservationLines = undefined;
  if (corruption === "target")
    input.rawObservationLines!.push(observationLine("10%対象 4,373円", 4373, 2));
  if (corruption === "rounding") input.taxSummaries[0].roundingMethod = "ceil";
  const result = reinterpretDraftTax(input);
  expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
  expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
});
