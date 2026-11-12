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

describe("登録額の算術とエラーの優先順位", () => {
  const good = {
    itemName: "商品",
    lineType: "item" as const,
    amountYen: 100,
    categoryId: "food",
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
  };
  it("税額が未配分でも登録額の合計不一致を拒否する", () => {
    const item = {
      ...good,
      itemName: "クーポン",
      normalizedAmountYen: 108,
      amountBasis: "tax_excluded" as const,
      taxRatePercent: 8 as const,
      taxAllocationStatus: "unallocated" as const,
    };
    expect(aggregateDraftItemsByCategory({ amountYen: 109, categoryId: "food" }, [item])).toEqual({
      success: false,
      error: "amount_mismatch",
    });
  });
  it("合計不一致をカテゴリ別合計より先に返す", () => {
    expect(
      aggregateDraftItemsByCategory({ amountYen: 95, categoryId: "food" }, [
        good,
        { ...good, itemName: "割引", lineType: "discount", amountYen: -10, categoryId: "other" },
      ]),
    ).toEqual({ success: false, error: "amount_mismatch" });
  });
  it("先の明細のカテゴリ欠落を後の明細の符号不正より先に返す", () => {
    expect(
      aggregateDraftItemsByCategory({ amountYen: 90, categoryId: "food" }, [
        { ...good, categoryId: undefined },
        { ...good, amountYen: -10 },
      ]),
    ).toEqual({ success: false, error: "missing_category" });
  });
});

it("余分な税フィールドを含む乱数明細も成功時は登録額・符号・カテゴリ合計が正しい", async () => {
  const { isValidSignedLineItemAmount } = await import("../receipt/discountItems");
  let seed = 31977;
  const rnd = (n: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * n);
  };
  let successful = 0;
  for (let iteration = 0; iteration < 5000; iteration++) {
    const items = Array.from({ length: 1 + rnd(4) }, () => ({
      itemName: rnd(2) ? "商品" : "特売",
      lineType: (["item", "discount", "unknown"] as const)[rnd(3)],
      amountYen: [-10, 0, 10, 100][rnd(4)],
      normalizedAmountYen: [undefined, -10, 10, 100, 108][rnd(5)],
      categoryId: (["food", "other", undefined] as const)[rnd(3)],
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      amountBasis: (["tax_included", "tax_excluded", "unknown"] as const)[rnd(3)],
      taxRatePercent: 8,
      taxAllocationStatus: (["allocated", "unallocated"] as const)[rnd(2)],
    }));
    const total = items.reduce((s, i) => s + (i.normalizedAmountYen ?? i.amountYen), 0);
    const amountYen = total + rnd(3) - 1;
    const result = aggregateDraftItemsByCategory({ amountYen, categoryId: "food" }, items);
    if (!result.success) continue;
    successful++;
    expect(total).toBe(amountYen);
    expect(
      items.every((i) =>
        isValidSignedLineItemAmount(i.itemName, i.normalizedAmountYen ?? i.amountYen, i.lineType),
      ),
    ).toBe(true);
    const totals = new Map<string, number>();
    for (const item of items)
      totals.set(
        item.categoryId!,
        (totals.get(item.categoryId!) ?? 0) + (item.normalizedAmountYen ?? item.amountYen),
      );
    expect([...totals.values()].every((amount) => amount > 0)).toBe(true);
  }
  expect(successful).toBeGreaterThan(0);
});
