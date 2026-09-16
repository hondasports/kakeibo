import { describe, expect, it } from "vitest";
import type { IncomeListEntry, SpendingEntry } from "../../domain/receipt/spendingEntry";
import type { YearlyMonthSource } from "../../domain/receipt/yearlySummary";
import {
  getDailySpendingTrend,
  getFourWeeksSummary,
  getMonthlyExpensesSummary,
  getMonthSummaryWithCategories,
  getWeekSummary,
  getWeekSummaryWithCategories,
  getYearSummary,
  type SummaryStore,
} from "./summaries";

const GROUP = "g1";

function entry(overrides: Partial<SpendingEntry> = {}): SpendingEntry {
  return {
    _id: "e1",
    date: "2025-01-06",
    amountYen: 1000,
    categoryId: "cat-1",
    recordType: "expenseEntry",
    ...overrides,
  };
}

function income(overrides: Partial<IncomeListEntry> = {}): IncomeListEntry {
  return {
    _id: "i1",
    date: "2025-01-06",
    amountYen: 5000,
    ...overrides,
  };
}

type StoreOverrides = Partial<{
  [K in keyof SummaryStore]: SummaryStore[K];
}>;

function makeStore(overrides: StoreOverrides = {}): SummaryStore {
  return {
    getWeekSpendingEntries: async () => [],
    getWeekIncomeEntries: async () => [],
    getDateSpendingEntries: async () => [],
    getMonthSpendingEntries: async () => [],
    getMonthIncomeEntries: async () => [],
    getYearAggregationEntries: async () => [],
    getMonthlyIncome: async () => undefined,
    buildCategoryInfoMap: async () => new Map(),
    ...overrides,
  };
}

describe("getWeekSummary", () => {
  it("前週が0件なら prevWeekTotalAmountYen は null", async () => {
    const store = makeStore({
      getWeekSpendingEntries: async (_g, weekStart) =>
        weekStart === "2025-01-06" ? [entry()] : [],
    });
    const result = await getWeekSummary(store, GROUP, { weekStartDate: "2025-01-06" });
    expect(result.count).toBe(1);
    expect(result.totalAmountYen).toBe(1000);
    expect(result.prevWeekReceiptCount).toBe(0);
    expect(result.prevWeekTotalAmountYen).toBeNull();
  });

  it("前週があるなら前週合計を返す（前週は当週-7日を問い合わせる）", async () => {
    const queried: string[] = [];
    const store = makeStore({
      getWeekSpendingEntries: async (_g, weekStart) => {
        queried.push(weekStart);
        return weekStart === "2024-12-30" ? [entry({ amountYen: 300 })] : [];
      },
    });
    const result = await getWeekSummary(store, GROUP, { weekStartDate: "2025-01-06" });
    expect(queried).toEqual(["2025-01-06", "2024-12-30"]);
    expect(result.prevWeekReceiptCount).toBe(1);
    expect(result.prevWeekTotalAmountYen).toBe(300);
  });
});

describe("getWeekSummaryWithCategories", () => {
  it("支出・収入・カテゴリ集計を組み立てる", async () => {
    const store = makeStore({
      getWeekSpendingEntries: async (_g, weekStart) =>
        weekStart === "2025-01-06"
          ? [entry({ amountYen: 1000 }), entry({ _id: "e2", amountYen: 500 })]
          : [entry({ _id: "e3", amountYen: 200 })],
      getWeekIncomeEntries: async () => [income(), income({ _id: "i2", amountYen: 3000 })],
      buildCategoryInfoMap: async () => new Map([["cat-1", { name: "食費", color: "#F00" }]]),
    });
    const result = await getWeekSummaryWithCategories(store, GROUP, {
      weekStartDate: "2025-01-06",
    });
    expect(result.count).toBe(2);
    expect(result.totalAmountYen).toBe(1500);
    expect(result.totalIncomeYen).toBe(8000);
    expect(result.incomeCount).toBe(2);
    expect(result.prevWeekReceiptCount).toBe(1);
    expect(result.prevWeekTotalAmountYen).toBe(200);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0].categoryName).toBe("食費");
    expect(result.incomes).toHaveLength(2);
    expect(result.byCategory[0].categoryName).toBe("食費");
  });
});

describe("getFourWeeksSummary", () => {
  it("最新から遡って4週問い合わせ、古い順で返す。0円週はweekCountから除外", async () => {
    const queried: string[] = [];
    const store = makeStore({
      getWeekSpendingEntries: async (_g, weekStart) => {
        queried.push(weekStart);
        // 最古週のみ0件、残りは金額つき
        return weekStart === "2024-12-16" ? [] : [entry({ amountYen: 100 })];
      },
    });
    const result = await getFourWeeksSummary(store, GROUP, { weekStartDate: "2025-01-06" });
    expect(queried).toEqual(["2025-01-06", "2024-12-30", "2024-12-23", "2024-12-16"]);
    expect(result.weeks.map((w) => w.weekStartDate)).toEqual([
      "2024-12-16",
      "2024-12-23",
      "2024-12-30",
      "2025-01-06",
    ]);
    expect(result.weekCount).toBe(3);
  });
});

describe("getDailySpendingTrend", () => {
  it("当週・前週の7日分を日付順に返す", async () => {
    const dates: string[] = [];
    const store = makeStore({
      getDateSpendingEntries: async (_g, date) => {
        dates.push(date);
        return [entry({ amountYen: 10 })];
      },
    });
    const result = await getDailySpendingTrend(store, GROUP, { weekStartDate: "2025-01-06" });
    expect(result.currentWeek).toHaveLength(7);
    expect(result.previousWeek).toHaveLength(7);
    expect(result.currentWeek[0].date).toBe("2025-01-06");
    expect(result.currentWeek[6].date).toBe("2025-01-12");
    expect(result.previousWeek[0].date).toBe("2024-12-30");
    expect(result.previousWeek[6].date).toBe("2025-01-05");
    expect(result.currentWeek[0].totalAmountYen).toBe(10);
    // 前週初日から当週末日まで順序どおり14回問い合わせ
    expect(dates).toHaveLength(14);
  });
});

describe("getMonthlyExpensesSummary", () => {
  it("monthlyIncomeを渡して月次集計する", async () => {
    const store = makeStore({
      getMonthSpendingEntries: async () => [entry({ date: "2025-01-10", amountYen: 700 })],
      getMonthlyIncome: async () => 200000,
    });
    const result = await getMonthlyExpensesSummary(store, GROUP, "u1", {
      monthStartDate: "2025-01-01",
    });
    expect(result.totalExpensesYen).toBe(700);
    expect(result.monthlyIncome).toBe(200000);
    expect(result.remainingBalanceYen).toBe(199300);
  });
});

describe("getMonthSummaryWithCategories", () => {
  it("netAmountYen = 収入 - 支出、収入・領収書を返す", async () => {
    const store = makeStore({
      getMonthSpendingEntries: async () => [entry({ amountYen: 800 })],
      getMonthIncomeEntries: async () => [income({ amountYen: 5000 })],
      buildCategoryInfoMap: async () => new Map(),
    });
    const result = await getMonthSummaryWithCategories(store, GROUP, { month: "2025-01" });
    expect(result.totalAmountYen).toBe(800);
    expect(result.totalIncomeYen).toBe(5000);
    expect(result.netAmountYen).toBe(4200);
    expect(result.incomeCount).toBe(1);
    expect(result.receipts[0].categoryName).toBe("不明");
  });
});

describe("getYearSummary", () => {
  it("全月の支出からカテゴリIDを集めてカテゴリ情報を引く", async () => {
    const monthSource: YearlyMonthSource = {
      month: "2025-01",
      expenses: [
        { categoryId: "cat-1", amountYen: 100 },
        { categoryId: "cat-2", amountYen: 200 },
      ],
      incomes: [],
    };
    let collected: string[] = [];
    const store = makeStore({
      getYearAggregationEntries: async () => [monthSource],
      buildCategoryInfoMap: async (_g, ids) => {
        collected = ids;
        return new Map([
          ["cat-1", { name: "食費", color: "#F00" }],
          ["cat-2", { name: "交通費", color: "#0F0" }],
        ]);
      },
    });
    const result = await getYearSummary(store, GROUP, { year: "2025" });
    expect(collected.sort()).toEqual(["cat-1", "cat-2"]);
    expect(result.year).toBe("2025");
    expect(result.months).toHaveLength(12);
  });
});
