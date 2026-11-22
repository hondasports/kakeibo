import { describe, expect, it, vi } from "vitest";
import { ExpenseSearchDomainError } from "../../domain/expenseSearch/searchResult";
import {
  AGGREGATE_RESCAN_MAX_RECORDS,
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
  it("ページサイズ1でも指定範囲全体のトレンド・集計を返す", async () => {
    const { store } = createStore({
      loadHistoryEntries: async () => ({
        entries: [
          {
            _id: "first",
            date: "2026-01-01",
            amountYen: 100,
            categoryId: "cat-a",
            recordType: "expenseEntry",
          },
          {
            _id: "last",
            date: "2026-12-31",
            amountYen: 200,
            categoryId: "cat-a",
            recordType: "expenseEntry",
          },
        ],
        incomes: [],
        truncated: false,
      }),
    });
    const result = await searchExpenses(store, "g1", {
      paginationOpts: { numItems: 1, cursor: null },
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(result.page).toHaveLength(1);
    expect(result.isDone).toBe(false);
    expect(result.totalExpenseYen).toBe(300);
    expect(result.trend).toHaveLength(12);
    expect(result.trend[0]?.totalExpenseYen).toBe(100);
    expect(result.trend.at(-1)?.totalExpenseYen).toBe(200);
  });

  it.each([{}, { startDate: "2000-01-01" }, { endDate: "2100-01-01" }])(
    "履歴から補完した過大範囲もドメインエラーとして返す: %j",
    async (dates) => {
      const { store } = createStore({
        loadHistoryEntries: async () => ({
          entries: [
            {
              _id: "first",
              date: "2000-01-01",
              amountYen: 100,
              categoryId: "cat-a",
              recordType: "expenseEntry",
            },
            {
              _id: "last",
              date: "2100-01-01",
              amountYen: 200,
              categoryId: "cat-a",
              recordType: "expenseEntry",
            },
          ],
          incomes: [],
          truncated: false,
        }),
      });
      await expect(searchExpenses(store, "g1", { ...baseArgs, ...dates })).rejects.toBeInstanceOf(
        ExpenseSearchDomainError,
      );
    },
  );

  it("巨大な明示期間は履歴・カテゴリの読み込み前にドメインエラーで拒否する", async () => {
    const { store, loadHistoryEntries, getCategoryGroupId, buildCategoryInfoMap } = createStore();
    await expect(
      searchExpenses(store, "g1", {
        ...baseArgs,
        categoryId: "cat-a",
        startDate: "0100-01-01",
        endDate: "9999-12-31",
      }),
    ).rejects.toThrow("期間は1200か月以内で指定してください");
    expect(loadHistoryEntries).not.toHaveBeenCalled();
    expect(getCategoryGroupId).not.toHaveBeenCalled();
    expect(buildCategoryInfoMap).not.toHaveBeenCalled();
  });

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
    expect(loadHistoryEntries).toHaveBeenNthCalledWith(1, "g1", "2026-01-01", "2026-01-31", "desc");
    // 前期間比較も集計と同様に並び順に依存せず、常に新しい側の範囲を読む。
    expect(loadHistoryEntries).toHaveBeenNthCalledWith(2, "g1", "2025-12-01", "2025-12-31", "desc");
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

  it.each([
    ["dateAsc", "asc"],
    ["dateDesc", "desc"],
    ["amountDesc", "desc"],
  ] as const)(
    "sortOrder=%s のとき取得順 %s で読み込む（打ち切り時は表示順の先頭側が残る）",
    async (sortOrder, expectedOrder) => {
      const { store, loadHistoryEntries } = createStore();
      await searchExpenses(store, "group-1", { ...baseArgs, sortOrder });
      expect(loadHistoryEntries).toHaveBeenNthCalledWith(
        1,
        "group-1",
        undefined,
        undefined,
        expectedOrder,
      );
    },
  );

  it.each(["dateAsc", "dateDesc", "amountDesc"] as const)(
    "打ち切り時でも sortOrder=%s で集計値は同じ（集計は並び順に依存しない）",
    async (sortOrder) => {
      const entries = [
        {
          _id: "e1",
          date: "2026-01-10",
          amountYen: 800,
          categoryId: "cat-a",
          recordType: "expenseEntry",
        },
        {
          _id: "e2",
          date: "2026-01-20",
          amountYen: 400,
          categoryId: "cat-a",
          recordType: "expenseEntry",
        },
      ];
      const loadHistoryEntries = vi.fn(
        async (
          _g: string,
          _s: string | undefined,
          _e: string | undefined,
          order?: "asc" | "desc",
        ) => ({
          entries: order === "desc" ? [entries[1]!] : [entries[0]!],
          incomes: [],
          truncated: true,
        }),
      );
      const { store } = createStore({ loadHistoryEntries });
      const result = await searchExpenses(store, "g1", {
        ...baseArgs,
        sortOrder,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      // 集計は常に新しい側（e2=400）を対象にする。
      expect(result.totalExpenseYen).toBe(400);
      expect(result.expenseCount).toBe(1);
      expect(result.matchedGroupCount).toBe(1);
      // 前期間読込みと合わせて新しい側は必ず読まれている。
      if (sortOrder === "dateAsc") {
        // dateAsc では一覧（asc）・集計用の再読（desc・走査上限つき）・
        // 前期間（desc）の3回読む。
        expect(loadHistoryEntries).toHaveBeenNthCalledWith(
          2,
          "g1",
          "2026-01-01",
          "2026-01-31",
          "desc",
          AGGREGATE_RESCAN_MAX_RECORDS,
        );
        expect(loadHistoryEntries).toHaveBeenNthCalledWith(
          3,
          "g1",
          "2025-12-01",
          "2025-12-31",
          "desc",
        );
        expect(loadHistoryEntries).toHaveBeenCalledTimes(3);
      } else {
        // dateDesc/amountDesc も集計用に新しい側を件数を絞って読み直す
        // （一覧・集計用の再読・前期間の3回）。
        expect(loadHistoryEntries).toHaveBeenNthCalledWith(
          2,
          "g1",
          "2026-01-01",
          "2026-01-31",
          "desc",
          AGGREGATE_RESCAN_MAX_RECORDS,
        );
        expect(loadHistoryEntries).toHaveBeenNthCalledWith(
          3,
          "g1",
          "2025-12-01",
          "2025-12-31",
          "desc",
        );
        expect(loadHistoryEntries).toHaveBeenCalledTimes(3);
      }
    },
  );
});
