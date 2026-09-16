import { describe, expect, it } from "vitest";
import type { SearchableHistoryGroup } from "./filter";
import { collectCategoryIds, emptySearchResult, mapHistoryGroupToItems } from "./searchResult";

describe("emptySearchResult", () => {
  it("空の検索結果を返す", () => {
    expect(emptySearchResult()).toEqual({
      page: [],
      continueCursor: "v1.empty",
      isDone: true,
      truncated: false,
      comparisonTruncated: false,
      matchedGroupCount: 0,
      totalCount: 0,
      expenseCount: 0,
      incomeCount: 0,
      totalExpenseYen: 0,
      totalIncomeYen: 0,
      netAmountYen: 0,
      byCategory: [],
      trend: [],
      comparison: null,
    });
  });
});

describe("collectCategoryIds", () => {
  it("支出明細のcategoryIdを重複排除して返し、収入グループは除外する", () => {
    const groups: SearchableHistoryGroup[] = [
      {
        id: "g1",
        date: "2026-01-01",
        shopName: "店",
        amountYen: 100,
        type: "expense",
        items: [
          {
            _id: "e1",
            date: "2026-01-01",
            amountYen: 100,
            categoryId: "cat-a",
            recordType: "expenseEntry",
          },
          {
            _id: "e2",
            date: "2026-01-01",
            amountYen: 50,
            categoryId: "cat-a",
            recordType: "expenseEntry",
          },
        ],
      },
      {
        id: "income:x",
        date: "2026-01-01",
        type: "income",
        amountYen: 1000,
        items: [],
        income: {
          _id: "i1",
          date: "2026-01-01",
          type: "income",
          amountYen: 1000,
          recordType: "expenseEntry",
        },
      },
    ];
    expect(collectCategoryIds(groups)).toEqual(["cat-a"]);
  });
});

describe("mapHistoryGroupToItems", () => {
  it("収入グループはbankNameとrecordTypeを持つ1項目になる", () => {
    const group: SearchableHistoryGroup = {
      id: "income:x",
      date: "2026-01-02",
      type: "income",
      bankName: "テスト銀行",
      amountYen: 2000,
      items: [],
      income: {
        _id: "i1",
        date: "2026-01-02",
        type: "income",
        bankName: "テスト銀行",
        amountYen: 2000,
        memo: "給与",
        recordType: "receipt",
      },
    };
    expect(mapHistoryGroupToItems(group, new Map())).toEqual([
      {
        _id: "i1",
        date: "2026-01-02",
        type: "income",
        bankName: "テスト銀行",
        amountYen: 2000,
        memo: "給与",
        recordType: "receipt",
      },
    ]);
  });

  it("支出項目はカテゴリ情報が無い場合にフォールバック名と色を使う", () => {
    const group: SearchableHistoryGroup = {
      id: "g1",
      date: "2026-01-03",
      shopName: "スーパー",
      amountYen: 500,
      type: "expense",
      items: [
        {
          _id: "e1",
          date: "2026-01-03",
          amountYen: 500,
          categoryId: "cat-x",
          shopName: "スーパー",
          recordType: "receipt",
          itemName: "牛乳",
          receiptGroupId: "rg1",
          receiptShopName: "スーパー",
          receiptTotalAmountYen: 900,
        },
      ],
    };
    expect(mapHistoryGroupToItems(group, new Map())).toEqual([
      {
        _id: "e1",
        date: "2026-01-03",
        type: "expense",
        shopName: "スーパー",
        amountYen: 500,
        categoryId: "cat-x",
        categoryName: "不明",
        categoryColor: "#AAB7C4",
        memo: undefined,
        recordType: "receipt",
        itemName: "牛乳",
        receiptGroupId: "rg1",
        receiptShopName: "スーパー",
        receiptTotalAmountYen: 900,
      },
    ]);
  });

  it("支出項目はカテゴリ情報がある場合にその名前と色を使う", () => {
    const group: SearchableHistoryGroup = {
      id: "g1",
      date: "2026-01-03",
      shopName: "スーパー",
      amountYen: 500,
      type: "expense",
      items: [
        {
          _id: "e1",
          date: "2026-01-03",
          amountYen: 500,
          categoryId: "cat-x",
          recordType: "expenseEntry",
        },
      ],
    };
    const info = new Map([["cat-x", { name: "食費", color: "#f97316" }]]);
    const [item] = mapHistoryGroupToItems(group, info);
    expect(item.categoryName).toBe("食費");
    expect(item.categoryColor).toBe("#f97316");
  });
});
