import { describe, expect, it } from "vitest";
import { interpretReceiptTax } from "./interpretReceiptTax";
import { draftItemToExtractedReceiptItem, mapDraftItemToTaxFields } from "./draftTaxMapping";

describe("mapDraftItemToTaxFields", () => {
  it("printedAmountYen がなければ amountYen を fallback する", () => {
    const result = mapDraftItemToTaxFields({
      itemName: "商品",
      amountYen: 1000,
    });
    expect(result.printedAmountYen).toBe(1000);
  });

  it("taxRatePercent が undefined なら null にする", () => {
    const result = mapDraftItemToTaxFields({
      itemName: "商品",
      amountYen: 1000,
      taxRatePercent: 10,
    });
    expect(result.taxRatePercent).toBe(10);

    const resultNull = mapDraftItemToTaxFields({
      itemName: "商品",
      amountYen: 1000,
    });
    expect(resultNull.taxRatePercent).toBeNull();
  });

  it("quantity / unitPriceYen の null は undefined に正規化する", () => {
    const result = mapDraftItemToTaxFields({
      itemName: "商品",
      amountYen: 1000,
      quantity: null,
      unitPriceYen: null,
    });
    expect(result.quantity).toBeUndefined();
    expect(result.unitPriceYen).toBeUndefined();
  });

  it("既存の値を維持する", () => {
    const result = mapDraftItemToTaxFields({
      itemName: "商品",
      printedAmountYen: 1100,
      amountYen: 1000,
      amountBasis: "tax_included",
      taxRatePercent: 10,
      markers: ["*"],
      taxMarker: "*",
      categoryName: "食費",
      quantity: 2,
      unitPriceYen: 500,
      warnings: [],
      taxResolutionStatus: "unresolved",
      taxResolutionSource: "single_summary",
      taxReviewReasons: [],
    });
    expect(result).toEqual({
      itemName: "商品",
      printedAmountYen: 1100,
      amountBasis: "tax_included",
      taxRatePercent: 10,
      markers: ["*"],
      taxMarker: "*",
      categoryName: "食費",
      quantity: 2,
      unitPriceYen: 500,
      warnings: [],
      taxResolutionStatus: "unresolved",
      taxResolutionSource: "single_summary",
      taxReviewReasons: [],
    });
  });
});

describe("draftItemToExtractedReceiptItem taxMarker 正規化", () => {
  it.each([undefined, []] as const)(
    "markers %s かつ taxMarker 非空は markers に畳み込み taxMarker を出力しない",
    (markers) => {
      const result = draftItemToExtractedReceiptItem({
        itemName: "商品",
        printedAmountYen: 100,
        markers,
        taxMarker: "※",
      });
      expect(result.markers).toEqual(["※"]);
      expect(result).not.toHaveProperty("taxMarker");
    },
  );

  it("markers 非空なら taxMarker より markers を優先する", () => {
    const result = draftItemToExtractedReceiptItem({
      itemName: "商品",
      printedAmountYen: 100,
      markers: ["#"],
      taxMarker: "※",
    });
    expect(result.markers).toEqual(["#"]);
    expect(result).not.toHaveProperty("taxMarker");
  });

  it("markers 空 + taxMarker の旧保存明細は fold 後に markers 指定時と同じ税解釈になる", () => {
    const markerDefinitions = [{ marker: "*", description: "軽減税率8%対象" }];
    const taxSummaries = [
      {
        taxRatePercent: 8 as const,
        taxMode: "external" as const,
        taxableAmountYen: 1559,
        taxableAmountBasis: "tax_excluded" as const,
        taxYen: 124,
        roundingMethod: "unknown" as const,
        confidence: {},
        warnings: [],
      },
    ];
    const shared = {
      amountYen: 1683,
      receiptTotalSource: "explicit_label" as const,
      markerDefinitions,
      taxSummaries,
    };
    // 永続済み旧形式: markers 空かつ taxMarker のみを持つ明細
    const legacyItem = draftItemToExtractedReceiptItem({
      itemName: "item",
      printedAmountYen: 1000,
      markers: [],
      taxMarker: "*",
    });
    const legacyResult = interpretReceiptTax({
      ...shared,
      items: [
        legacyItem,
        draftItemToExtractedReceiptItem({
          itemName: "item",
          printedAmountYen: 559,
          markers: ["*"],
        }),
      ],
    });
    const canonicalResult = interpretReceiptTax({
      ...shared,
      items: [
        draftItemToExtractedReceiptItem({
          itemName: "item",
          printedAmountYen: 1000,
          markers: ["*"],
        }),
        draftItemToExtractedReceiptItem({
          itemName: "item",
          printedAmountYen: 559,
          markers: ["*"],
        }),
      ],
    });
    expect(legacyResult).toEqual(canonicalResult);
    expect(legacyResult.items[0].taxContext).toMatchObject({
      status: "resolved",
      source: "marker_reconciled",
      taxRatePercent: 8,
    });
  });
});
