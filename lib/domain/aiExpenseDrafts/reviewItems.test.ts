import { describe, expect, it } from "vitest";
import {
  aggregateDraftItemsByCategory,
  getDraftItemAggregationErrorMessage,
  hasLowConfidenceItem,
  summarizeItems,
  validatePositiveCategoryTotals,
} from "./reviewItems";

describe("hasLowConfidenceItem", () => {
  it("すべての信頼度が閾値以上なら false", () => {
    expect(
      hasLowConfidenceItem({ confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 } }),
    ).toBe(false);
  });

  it("いずれかが閾値未満なら true", () => {
    expect(
      hasLowConfidenceItem({ confidence: { itemName: 0.7, amountYen: 0.9, categoryId: 0.9 } }),
    ).toBe(true);
    expect(hasLowConfidenceItem({ confidence: { amountYen: 0.7 } })).toBe(true);
  });

  it("categoryName で代替できる", () => {
    expect(hasLowConfidenceItem({ confidence: { categoryName: 0.7 } })).toBe(true);
  });
});

describe("summarizeItems", () => {
  it("空配列なら undefined", () => {
    expect(summarizeItems({ amountYen: 1000 }, [])).toBeUndefined();
  });

  it("明細を合計しカテゴリごとに集計する", () => {
    const result = summarizeItems({ amountYen: 1000 }, [
      { amountYen: 500, categoryId: "cat1", confidence: {} },
      { amountYen: 300, categoryId: "cat2", confidence: {} },
      { amountYen: 200, categoryId: "cat1", confidence: {} },
    ]);
    expect(result).toMatchObject({
      itemTotalYen: 1000,
      itemDifferenceYen: 0,
      hasUncategorizedItems: false,
      hasLowConfidenceItems: false,
      categoryAggregates: [
        { categoryId: "cat1", amountYen: 700 },
        { categoryId: "cat2", amountYen: 300 },
      ],
    });
  });

  it("categoryId が未設定なら hasUncategorizedItems が true", () => {
    const result = summarizeItems({ amountYen: 100 }, [{ amountYen: 100, confidence: {} }]);
    expect(result?.hasUncategorizedItems).toBe(true);
  });

  it("低信頼度明細があれば hasLowConfidenceItems が true", () => {
    const result = summarizeItems({ amountYen: 100 }, [
      { amountYen: 100, categoryId: "cat1", confidence: { itemName: 0.7 } },
    ]);
    expect(result?.hasLowConfidenceItems).toBe(true);
  });
});

describe("validatePositiveCategoryTotals", () => {
  it("カテゴリ合計がすべて正なら true", () => {
    expect(
      validatePositiveCategoryTotals([
        { categoryId: "cat1", amountYen: 500 },
        { categoryId: "cat1", amountYen: -100 },
        { categoryId: "cat1", amountYen: 700 },
      ]),
    ).toBe(true);
  });

  it("カテゴリ合計が 0 以下なら false", () => {
    expect(
      validatePositiveCategoryTotals([
        { categoryId: "cat1", amountYen: 500 },
        { categoryId: "cat1", amountYen: -500 },
      ]),
    ).toBe(false);
  });
});

describe("getDraftItemAggregationErrorMessage", () => {
  it.each([
    ["invalid_item_amount", "Draft item amount is required to register"],
    ["missing_category", "Draft item category is required to register"],
    ["low_confidence", "Low confidence draft items must be reviewed before register"],
    ["amount_mismatch", "Draft item total must match draft amount"],
    ["non_positive_category_total", "Draft category total must be greater than zero"],
  ] as const)("%s -> %s", (error, expected) => {
    expect(getDraftItemAggregationErrorMessage(error)).toBe(expected);
  });
});

describe("aggregateDraftItemsByCategory の割引行", () => {
  const draft = { amountYen: 165, categoryId: "daily", documentType: "receipt" as const };
  const product = {
    itemName: "商品A",
    amountYen: 179,
    categoryId: "daily",
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
  };
  const discount = (itemName: string, lineType?: "discount" | "promotion_adjustment") => ({
    itemName,
    lineType,
    amountYen: -14,
    categoryId: "daily",
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
  });

  it.each([
    ["行種別が割引なら品名に割引の語が無くても登録できる", discount("特売", "discount")],
    ["行種別が販促の調整でも登録できる", discount("まとめ割", "promotion_adjustment")],
    ["行種別の無い旧データは品名に割引の語があれば登録できる", discount("値引")],
  ])("%s", (_caseName, discountItem) => {
    expect(aggregateDraftItemsByCategory(draft, [product, discountItem])).toEqual({
      success: true,
      items: [{ itemName: "商品A、" + discountItem.itemName, amountYen: 165, categoryId: "daily" }],
    });
  });

  it("行種別の無い旧データで品名に割引の語が無い負の明細は登録しない", () => {
    expect(aggregateDraftItemsByCategory(draft, [product, discount("特売")])).toEqual({
      success: false,
      error: "invalid_item_amount",
    });
  });
});
