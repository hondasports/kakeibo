import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";

describe("reinterpretDraftTax (bulkUnresolvedOverride)", () => {
  it("bulkUnresolvedOverride は未解決行すべてに税率とamountBasisを適用する", () => {
    const unresolvedItems = [
      {
        itemName: "A",
        printedAmountYen: 4000,
        amountBasis: "unknown" as const,
        taxRatePercent: null,
        taxResolutionStatus: "unresolved" as const,
        markers: [] as string[],
        warnings: [] as string[],
      },
      {
        itemName: "B",
        printedAmountYen: 3928,
        amountBasis: "unknown" as const,
        taxRatePercent: null,
        taxResolutionStatus: "unresolved" as const,
        markers: [] as string[],
        warnings: [] as string[],
      },
    ];

    const result = reinterpretDraftTax({
      amountYen: 8562,
      items: unresolvedItems,
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 7928,
          taxableAmountBasis: "tax_excluded",
          taxYen: 634,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
        },
      ],
      bulkUnresolvedOverride: {
        taxRatePercent: 8,
        amountBasis: "tax_excluded",
      },
    });

    expect(result.itemFields.every((field) => field.taxResolutionStatus === "resolved")).toBe(true);
    expect(result.itemFields.every((field) => field.taxRatePercent === 8)).toBe(true);
    expect(
      result.itemFields.reduce((sum, field) => sum + (field.normalizedAmountYen ?? 0), 0),
    ).toBe(8562);
  });

  it("bulkUnresolvedOverride は部分上書き済みの税率を維持する", () => {
    const items = [
      {
        itemName: "A",
        printedAmountYen: 500,
        amountBasis: "unknown" as const,
        taxRatePercent: 8 as const,
        markers: [] as string[],
        warnings: [] as string[],
      },
      {
        itemName: "B",
        printedAmountYen: 500,
        amountBasis: "unknown" as const,
        taxRatePercent: null,
        markers: [] as string[],
        warnings: [] as string[],
      },
    ];

    const result = reinterpretDraftTax({
      amountYen: 1000,
      items,
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "included",
          taxableAmountYen: 1000,
          taxableAmountBasis: "tax_included",
          taxYen: 74,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
        },
      ],
      bulkUnresolvedOverride: {
        taxRatePercent: 10,
        amountBasis: "tax_included",
      },
    });

    expect(result.itemFields[0]?.taxRatePercent).toBe(8);
    expect(result.itemFields[1]?.taxRatePercent).toBe(10);
    expect(result.itemFields[1]?.amountBasis).toBe("tax_included");
  });
});
