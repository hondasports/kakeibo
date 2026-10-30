import { describe, expect, it } from "vitest";
import type { SpendingEntry } from "../receipt/spendingEntry";
import {
  filterHistoryGroups,
  groupSpendingEntries,
  paginateHistoryGroups,
  parseExpenseSearchFilters,
} from "./filter";

function entry(overrides: Partial<SpendingEntry> & Pick<SpendingEntry, "_id">): SpendingEntry {
  return {
    date: "2026-07-18",
    amountYen: 1000,
    categoryId: "cat-food",
    recordType: "expenseEntry",
    shopName: "スーパー北浜",
    receiptGroupId: "sourceDocument:doc-1",
    receiptShopName: "スーパー北浜",
    receiptTotalAmountYen: 3000,
    ...overrides,
  };
}

describe("groupSpendingEntries", () => {
  it("同一レシートの明細を1グループにまとめる", () => {
    const groups = groupSpendingEntries([
      entry({ _id: "e1", categoryId: "cat-food", itemName: "牛乳", amountYen: 200 }),
      entry({ _id: "e2", categoryId: "cat-daily", itemName: "洗剤", amountYen: 2800 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "sourceDocument:doc-1",
      shopName: "スーパー北浜",
      amountYen: 3000,
    });
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("グループIDが無い明細は1件ずつ独立させる", () => {
    const groups = groupSpendingEntries([
      entry({
        _id: "solo",
        receiptGroupId: undefined,
        receiptShopName: undefined,
        receiptTotalAmountYen: undefined,
        shopName: "コンビニ",
        amountYen: 120,
      }),
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        id: "expenseEntry:solo",
        shopName: "コンビニ",
        amountYen: 120,
      }),
    ]);
  });
});

describe("filterHistoryGroups", () => {
  const groups = groupSpendingEntries([
    entry({ _id: "e1", date: "2026-07-18", itemName: "牛乳" }),
    entry({
      _id: "e2",
      date: "2026-06-01",
      receiptGroupId: "sourceDocument:doc-2",
      receiptShopName: "セブンイレブン",
      receiptTotalAmountYen: 540,
      shopName: "お茶",
      amountYen: 540,
      categoryId: "cat-drink",
    }),
    entry({
      _id: "e3",
      date: "2026-05-10",
      receiptGroupId: "expenseEntry:e3",
      receiptShopName: "イオン",
      receiptTotalAmountYen: 12000,
      shopName: "イオン",
      amountYen: 12000,
      categoryId: "cat-food",
    }),
  ]);

  it("店名の部分一致で絞り込む（大文字小文字を無視）", () => {
    const filtered = filterHistoryGroups(groups, { entryType: "expense", shopQuery: "セブン" });
    expect(filtered.map((group) => group.shopName)).toEqual(["セブンイレブン"]);
  });

  it("種別フィルタは一致しないグループを除外する", () => {
    const filtered = filterHistoryGroups(groups, { entryType: "income" });
    expect(filtered).toHaveLength(0);
  });

  it("明細の商品名でも店名クエリにヒットする", () => {
    const filtered = filterHistoryGroups(groups, { entryType: "expense", shopQuery: "牛乳" });
    expect(filtered.map((group) => group.id)).toEqual(["sourceDocument:doc-1"]);
  });

  it("前後空白だけの店名クエリは条件なしとして扱う", () => {
    const filtered = filterHistoryGroups(groups, { entryType: "expense", shopQuery: "   " });
    expect(filtered).toHaveLength(3);
  });

  it("カテゴリが1明細でも一致すればレシート全体を残す", () => {
    const mixed = groupSpendingEntries([
      entry({ _id: "m1", categoryId: "cat-food", itemName: "パン" }),
      entry({ _id: "m2", categoryId: "cat-daily", itemName: "洗剤", amountYen: 2800 }),
    ]);
    const filtered = filterHistoryGroups(mixed, { entryType: "expense", categoryId: "cat-daily" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.items.map((item) => item.categoryId)).toEqual(["cat-food", "cat-daily"]);
  });

  it("レシート合計金額の下限・上限で絞り込む", () => {
    const filtered = filterHistoryGroups(groups, {
      entryType: "expense",
      minAmountYen: 500,
      maxAmountYen: 4000,
    });
    expect(filtered.map((group) => group.shopName)).toEqual(["スーパー北浜", "セブンイレブン"]);
  });

  it("日付範囲で絞り込む", () => {
    const filtered = filterHistoryGroups(groups, {
      entryType: "expense",
      startDate: "2026-06-01",
      endDate: "2026-07-31",
    });
    expect(filtered.map((group) => group.shopName)).toEqual(["スーパー北浜", "セブンイレブン"]);
  });

  it("複数条件はANDで適用する", () => {
    const filtered = filterHistoryGroups(groups, {
      entryType: "expense",
      shopQuery: "イオン",
      categoryId: "cat-food",
      minAmountYen: 10000,
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(filtered.map((group) => group.shopName)).toEqual(["イオン"]);
  });
});

describe("paginateHistoryGroups", () => {
  it("日付の新しい順でページングする", () => {
    const groups = groupSpendingEntries([
      entry({ _id: "old", date: "2026-01-01", receiptGroupId: "g-old", receiptShopName: "旧" }),
      entry({ _id: "new", date: "2026-08-01", receiptGroupId: "g-new", receiptShopName: "新" }),
      entry({ _id: "mid", date: "2026-04-01", receiptGroupId: "g-mid", receiptShopName: "中" }),
    ]);

    const first = paginateHistoryGroups(groups, { numItems: 2, cursor: null });
    expect(first.page.map((group) => group.shopName)).toEqual(["新", "中"]);
    expect(first.isDone).toBe(false);

    const second = paginateHistoryGroups(groups, {
      numItems: 2,
      cursor: first.continueCursor,
    });
    expect(second.page.map((group) => group.shopName)).toEqual(["旧"]);
    expect(second.isDone).toBe(true);
  });

  it("同じ日付ならidの新しい順にし、不正cursorは先頭から始める", () => {
    const groups = groupSpendingEntries([
      entry({
        _id: "a",
        date: "2026-07-18",
        receiptGroupId: "g-a",
        receiptShopName: "A店",
      }),
      entry({
        _id: "b",
        date: "2026-07-18",
        receiptGroupId: "g-b",
        receiptShopName: "B店",
      }),
    ]);
    const paged = paginateHistoryGroups(groups, { numItems: 2, cursor: "not-a-number" });
    expect(paged.page.map((group) => group.shopName)).toEqual(["B店", "A店"]);
  });

  it("v1形式でない数値のcursorはオフセットとして読まず先頭から始める", () => {
    const groups = groupSpendingEntries([
      entry({ _id: "old", date: "2026-01-01", receiptGroupId: "g-old", receiptShopName: "旧" }),
      entry({ _id: "new", date: "2026-08-01", receiptGroupId: "g-new", receiptShopName: "新" }),
      entry({ _id: "mid", date: "2026-04-01", receiptGroupId: "g-mid", receiptShopName: "中" }),
    ]);

    const paged = paginateHistoryGroups(groups, { numItems: 2, cursor: "2" });
    expect(paged.page.map((group) => group.shopName)).toEqual(["新", "中"]);
    expect(paged.isDone).toBe(false);
  });
});

describe("parseExpenseSearchFilters", () => {
  it.each([
    ["0100-01-01", "9999-12-31"],
    ["2000-01-01", "2100-01-01"],
  ])("1200か月を超える範囲 %s〜%s は拒否する", (startDate, endDate) => {
    expect(parseExpenseSearchFilters({ startDate, endDate })).toEqual({
      ok: false,
      error: "期間は1200か月以内で指定してください",
    });
  });

  it("上限ちょうどの1200か月を受け付ける", () => {
    expect(parseExpenseSearchFilters({ startDate: "2000-01-01", endDate: "2099-12-31" }).ok).toBe(
      true,
    );
  });

  it("正常な条件を正規化する", () => {
    expect(
      parseExpenseSearchFilters({
        shopQuery: "  北浜  ",
        minAmountYen: 100,
        maxAmountYen: 200,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      }),
    ).toEqual({
      ok: true,
      filters: {
        entryType: "all",
        shopQuery: "北浜",
        minAmountYen: 100,
        maxAmountYen: 200,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    });
  });

  it("下限が上限より大きい金額を拒否する", () => {
    expect(parseExpenseSearchFilters({ minAmountYen: 200, maxAmountYen: 100 })).toEqual({
      ok: false,
      error: "金額の下限は上限以下にしてください",
    });
  });

  it("負の金額を拒否する", () => {
    expect(parseExpenseSearchFilters({ minAmountYen: -1 })).toEqual({
      ok: false,
      error: "金額は0以上の整数で指定してください",
    });
  });

  it("開始日が終了日より後なら拒否する", () => {
    expect(parseExpenseSearchFilters({ startDate: "2026-02-01", endDate: "2026-01-01" })).toEqual({
      ok: false,
      error: "開始日は終了日以前にしてください",
    });
  });

  it("不正な日付を拒否する", () => {
    expect(parseExpenseSearchFilters({ startDate: "2026-13-01" })).toEqual({
      ok: false,
      error: "日付はYYYY-MM-DD形式で指定してください",
    });
  });

  it("終了日の形式不正も拒否する", () => {
    expect(parseExpenseSearchFilters({ endDate: "2026-02-30" })).toEqual({
      ok: false,
      error: "日付はYYYY-MM-DD形式で指定してください",
    });
  });

  it("長すぎる検索語を拒否する", () => {
    expect(parseExpenseSearchFilters({ shopQuery: "あ".repeat(81) })).toEqual({
      ok: false,
      error: "検索語は80文字以内で指定してください",
    });
  });

  it("上限金額の非整数を拒否する", () => {
    expect(parseExpenseSearchFilters({ maxAmountYen: 1.5 })).toEqual({
      ok: false,
      error: "金額は0以上の整数で指定してください",
    });
  });
});
