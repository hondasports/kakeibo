import { describe, expect, it } from "vitest";
import { EMPTY_EXPENSE_SEARCH_FORM } from "./searchParams";
import {
  describeSearchFilters,
  hasSearchCondition,
  summarizeSearchQuery,
} from "./searchFilterLabels";

describe("describeSearchFilters", () => {
  it("適用中の条件を表示順のラベルにする", () => {
    const chips = describeSearchFilters(
      {
        ...EMPTY_EXPENSE_SEARCH_FORM,
        entryType: "expense",
        shopQuery: "北浜",
        categoryId: "c1",
        minAmountYen: "1000",
        maxAmountYen: "5000",
        startDate: "2026-10-01",
      },
      "食費",
    );
    expect(chips).toEqual([
      { key: "entryType", label: "支出" },
      { key: "shopQuery", label: "キーワード: 北浜" },
      { key: "categoryId", label: "カテゴリ: 食費" },
      { key: "minAmountYen", label: "1,000円以上" },
      { key: "maxAmountYen", label: "5,000円以下" },
      { key: "dateRange", label: "2026-10-01〜指定なし" },
    ]);
  });

  it("条件が無ければ空配列", () => {
    expect(describeSearchFilters(EMPTY_EXPENSE_SEARCH_FORM)).toEqual([]);
  });
});

describe("hasSearchCondition", () => {
  it("絞り込みが1つ以上あるときだけ true（並び順だけ・空白だけのキーワードは false）", () => {
    expect(hasSearchCondition(EMPTY_EXPENSE_SEARCH_FORM)).toBe(false);
    expect(hasSearchCondition({ ...EMPTY_EXPENSE_SEARCH_FORM, sortOrder: "amountDesc" })).toBe(
      false,
    );
    expect(hasSearchCondition({ ...EMPTY_EXPENSE_SEARCH_FORM, shopQuery: "   " })).toBe(false);
    expect(hasSearchCondition({ ...EMPTY_EXPENSE_SEARCH_FORM, shopQuery: "北浜" })).toBe(true);
    expect(hasSearchCondition({ ...EMPTY_EXPENSE_SEARCH_FORM, entryType: "income" })).toBe(true);
  });
});

describe("summarizeSearchQuery", () => {
  const categoryNames = new Map([["c1", "食費"]]);

  it("query を人が読める要約にし、生のquery文字列を含めない", () => {
    const query = "type=expense&categoryId=c1&from=2026-10-01&to=2026-10-31";
    const summary = summarizeSearchQuery(query, categoryNames);
    expect(summary).toBe("支出、カテゴリ: 食費、2026-10-01〜2026-10-31");
    expect(summary).not.toContain("categoryId=");
  });

  it("並び順が既定以外なら要約に含める", () => {
    expect(summarizeSearchQuery("q=%E5%8C%97%E6%B5%9C&sort=amountDesc", categoryNames)).toBe(
      "キーワード: 北浜、金額が大きい順",
    );
  });

  it("未分類・解決できないカテゴリ・読み込み中を区別する", () => {
    expect(summarizeSearchQuery("categoryId=__uncategorized__", categoryNames)).toBe(
      "カテゴリ: 未分類",
    );
    expect(summarizeSearchQuery("categoryId=gone", categoryNames)).toBe("カテゴリ: 不明");
    expect(summarizeSearchQuery("categoryId=c1", undefined)).toBe("カテゴリ: 読み込み中");
  });

  it("無効化済みカテゴリには注記を付ける", () => {
    expect(
      summarizeSearchQuery("categoryId=old", new Map([["old", "旧カテゴリ（無効化済み）"]])),
    ).toBe("カテゴリ: 旧カテゴリ（無効化済み）");
  });
});
