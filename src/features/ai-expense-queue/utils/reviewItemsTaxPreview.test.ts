import { describe, expect, it } from "vitest";
import type { ReviewItemValues } from "../types/types";
import { applyReviewItemsTaxPreview } from "./reviewItemsTaxPreview";

function externalTaxItem(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
  return {
    id: "item-1",
    itemName: "たまご",
    amountYen: "298",
    categoryId: "cat1",
    printedAmountYen: 298,
    normalizedAmountYen: 322,
    allocatedTaxYen: 24,
    taxResolutionStatus: "resolved",
    taxRatePercent: 8,
    amountBasis: "tax_excluded",
    taxResolutionSource: "single_summary",
    ...overrides,
  };
}

describe("applyReviewItemsTaxPreview", () => {
  const taxSummaries = [
    {
      taxRatePercent: 8 as const,
      taxMode: "external" as const,
      taxableAmountYen: 298,
      taxableAmountBasis: "tax_excluded" as const,
      taxYen: 24,
      roundingMethod: "unknown" as const,
      warnings: [],
    },
  ];

  it("外税明細の手修正が税サマリーと不一致なら差額から税額を推定しない", () => {
    const items = [externalTaxItem({ amountYen: "300", printedAmountYen: 300 })];
    const previewed = applyReviewItemsTaxPreview(items, {
      paidTotalYen: 324,
      taxSummaries,
    });

    expect(previewed[0]?.normalizedAmountYen).toBe(300);
    expect(previewed[0]?.allocatedTaxYen).toBe(0);
  });

  it("税サマリが無い課税明細は保存済み金額を確定扱いにしない", () => {
    const items = [externalTaxItem()];
    expect(applyReviewItemsTaxPreview(items, { paidTotalYen: 322 })[0]).toMatchObject({
      taxAllocationStatus: "unallocated",
      normalizedAmountYen: 298,
    });
  });

  it("2段階のユーザー選択がAI税サマリーより優先される", () => {
    const previewed = applyReviewItemsTaxPreview(
      [externalTaxItem({ amountYen: "99", printedAmountYen: 99 })],
      {
        paidTotalYen: 108,
        taxSummaries,
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate8",
      },
    );

    expect(previewed[0]).toMatchObject({ normalizedAmountYen: 107, allocatedTaxYen: 8 });
  });
  it("配分状態のない旧API応答も内訳から再評価し、不一致の内訳は確定しない", () => {
    const legacy = [externalTaxItem()];
    expect(
      applyReviewItemsTaxPreview(legacy, { paidTotalYen: 322, taxSummaries })[0],
    ).toMatchObject({
      taxAllocationStatus: "allocated",
      normalizedAmountYen: 322,
      allocatedTaxYen: 24,
    });
    expect(
      applyReviewItemsTaxPreview(legacy, {
        paidTotalYen: 322,
        taxSummaries: taxSummaries.map((s) => ({ ...s, taxableAmountYen: 299 })),
      })[0],
    ).toMatchObject({ taxAllocationStatus: "unallocated" });
  });
});
