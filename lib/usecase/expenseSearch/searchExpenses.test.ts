import { describe, expect, it, vi } from "vitest";
import { ExpenseSearchDomainError } from "../../domain/expenseSearch/searchResult";
import {
  searchExpenses,
  type ExpenseSearchStore,
  type SearchHistorySource,
} from "./searchExpenses";

function createStore(overrides: Partial<ExpenseSearchStore> = {}) {
  const source: SearchHistorySource = { entries: [], incomes: [], truncated: false };
  const loadHistoryEntries = vi.fn(async () => source);
  const getCategoryGroupId = vi.fn(async () => undefined);
  const buildCategoryInfoMap = vi.fn(
    async () => new Map<string, { name: string; color: string }>(),
  );
  const store: ExpenseSearchStore = {
    getCategoryGroupId,
    loadHistoryEntries,
    buildCategoryInfoMap,
    ...overrides,
  };
  return { store, loadHistoryEntries, getCategoryGroupId, buildCategoryInfoMap };
}

const baseArgs = {
  paginationOpts: { numItems: 50, cursor: null },
};

describe("searchExpenses", () => {
  it("フィルタが不正ならパースエラーの文言でドメインエラーを投げる", async () => {
    const { store } = createStore();
    await expect(
      searchExpenses(store, "g1", { ...baseArgs, startDate: "invalid" }),
    ).rejects.toBeInstanceOf(ExpenseSearchDomainError);
  });

  it("指定カテゴリが他グループなら空結果を返し履歴は読まない", async () => {
    const { store, loadHistoryEntries } = createStore({
      getCategoryGroupId: async () => "other-group",
    });
    const result = await searchExpenses(store, "g1", {
      ...baseArgs,
      categoryId: "cat-x",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result).toEqual({
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
    expect(loadHistoryEntries).not.toHaveBeenCalled();
  });

  it("初回ページ（cursor null）かつ期間指定時は前期間も読み込み比較を返す", async () => {
    const { store, loadHistoryEntries } = createStore();
    const result = await searchExpenses(store, "g1", {
      ...baseArgs,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(loadHistoryEntries).toHaveBeenCalledTimes(2);
    expect(loadHistoryEntries).toHaveBeenNthCalledWith(1, "g1", "2026-01-01", "2026-01-31");
    expect(loadHistoryEntries).toHaveBeenNthCalledWith(2, "g1", "2025-12-01", "2025-12-31");
    expect(result.comparison).not.toBeNull();
  });

  it("2ページ目以降（cursor有り）は前期間を読まず比較はnull", async () => {
    const { store, loadHistoryEntries } = createStore();
    const result = await searchExpenses(store, "g1", {
      paginationOpts: { numItems: 50, cursor: "v1.something" },
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(loadHistoryEntries).toHaveBeenCalledTimes(1);
    expect(result.comparison).toBeNull();
  });

  it("期間未指定の初回ページは前期間を読まず比較はnull", async () => {
    const { store, loadHistoryEntries } = createStore();
    const result = await searchExpenses(store, "g1", baseArgs);
    expect(loadHistoryEntries).toHaveBeenCalledTimes(1);
    expect(result.comparison).toBeNull();
  });

  it("支出明細をページ項目へマッピングし集計値を返す", async () => {
    const source: SearchHistorySource = {
      entries: [
        {
          _id: "e1",
          date: "2026-01-10",
          amountYen: 800,
          categoryId: "cat-a",
          shopName: "スーパー",
          recordType: "expenseEntry",
        },
      ],
      incomes: [
        {
          _id: "i1",
          date: "2026-01-05",
          type: "income",
          bankName: "銀行",
          amountYen: 200000,
          recordType: "expenseEntry",
        },
      ],
      truncated: true,
    };
    const { store } = createStore({
      loadHistoryEntries: async () => source,
      buildCategoryInfoMap: async () => new Map([["cat-a", { name: "食費", color: "#f97316" }]]),
    });
    const result = await searchExpenses(store, "g1", baseArgs);
    expect(result.truncated).toBe(true);
    expect(result.matchedGroupCount).toBe(2);
    expect(result.expenseCount).toBe(1);
    expect(result.incomeCount).toBe(1);
    expect(result.totalExpenseYen).toBe(800);
    expect(result.totalIncomeYen).toBe(200000);
    const expenseItem = result.page.find((item) => item.type === "expense");
    expect(expenseItem).toMatchObject({
      _id: "e1",
      categoryName: "食費",
      categoryColor: "#f97316",
      recordType: "expenseEntry",
    });
    const incomeItem = result.page.find((item) => item.type === "income");
    expect(incomeItem).toMatchObject({ _id: "i1", bankName: "銀行", amountYen: 200000 });
  });
});
