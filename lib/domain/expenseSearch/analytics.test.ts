import { describe, expect, it, vi } from "vitest";
import * as dateHelpers from "../common/date";
import { ExpenseSearchDomainError } from "./searchResult";
import type { IncomeListEntry, SpendingEntry } from "../receipt/spendingEntry";
import {
  buildHistoryCategoryBreakdown,
  buildHistoryComparison,
  buildHistoryTrend,
  calculatePreviousHistoryPeriod,
  summarizeHistoryGroups,
} from "./analytics";
import { filterHistoryGroups, groupHistoryEntries } from "./filter";

const categoryInfo = new Map([
  ["food", { name: "食費", color: "#f97316" }],
  ["daily", { name: "日用品", color: "#0ea5e9" }],
]);

function expense(id: string, date: string, amountYen: number, categoryId = "food"): SpendingEntry {
  return {
    _id: id,
    date,
    amountYen,
    categoryId,
    shopName: id,
    recordType: "expenseEntry",
  };
}

function income(id: string, date: string, amountYen: number): IncomeListEntry {
  return { _id: id, date, type: "income", amountYen, bankName: id, recordType: "expenseEntry" };
}

describe("expense search analytics", () => {
  it("カテゴリを上位5件とその他へ集約する", () => {
    const categories = Array.from({ length: 6 }, (_, index) => ({
      categoryId: `category-${index}`,
      categoryName: `カテゴリ${index}`,
      categoryColor: "#000000",
      totalAmountYen: index + 1,
      count: 1,
    })).reverse();

    expect(buildHistoryCategoryBreakdown(categories)).toEqual([
      ...categories.slice(0, 5),
      {
        categoryId: "__other__",
        categoryName: "その他",
        categoryColor: "#9E9E9E",
        totalAmountYen: 1,
        count: 1,
      },
    ]);
  });

  it("支出・収入を合算し、カテゴリ別に支出だけ集計する", () => {
    const groups = filterHistoryGroups(
      groupHistoryEntries(
        [expense("e1", "2026-07-01", 1000), expense("e2", "2026-07-02", 500, "daily")],
        [income("i1", "2026-07-03", 3000)],
      ),
      { entryType: "all", startDate: "2026-07-01", endDate: "2026-07-31" },
    );

    expect(summarizeHistoryGroups(groups, categoryInfo)).toEqual({
      count: 3,
      expenseCount: 2,
      incomeCount: 1,
      totalExpenseYen: 1500,
      totalIncomeYen: 3000,
      netAmountYen: 1500,
      byCategory: [
        {
          categoryId: "food",
          categoryName: "食費",
          categoryColor: "#f97316",
          totalAmountYen: 1000,
          count: 1,
        },
        {
          categoryId: "daily",
          categoryName: "日用品",
          categoryColor: "#0ea5e9",
          totalAmountYen: 500,
          count: 1,
        },
      ],
    });
  });

  it("期間推移を日単位で作り、空の日も表示する", () => {
    const groups = groupHistoryEntries([expense("e1", "2026-07-01", 1000)], []);
    const trend = buildHistoryTrend(groups, {
      entryType: "all",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
    });

    expect(trend).toEqual([
      expect.objectContaining({ key: "2026-07-01", totalExpenseYen: 1000, totalIncomeYen: 0 }),
      expect.objectContaining({ key: "2026-07-02", totalExpenseYen: 0, totalIncomeYen: 0 }),
      expect.objectContaining({ key: "2026-07-03", totalExpenseYen: 0, totalIncomeYen: 0 }),
    ]);
  });

  it("32日以上の範囲を週単位にまとめ、範囲端を切り詰める", () => {
    const groups = groupHistoryEntries(
      [expense("e1", "2026-07-10", 1000)],
      [income("i1", "2026-08-10", 2000)],
    );
    const trend = buildHistoryTrend(groups, {
      entryType: "all",
      startDate: "2026-07-10",
      endDate: "2026-08-10",
    });

    expect(trend[0]).toMatchObject({
      granularity: "week",
      startDate: "2026-07-10",
      endDate: "2026-07-12",
      totalExpenseYen: 1000,
    });
    expect(trend[trend.length - 1]).toMatchObject({
      granularity: "week",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      totalIncomeYen: 2000,
    });
  });

  it("181日以上の範囲を月単位にまとめ、範囲端を切り詰める", () => {
    const groups = groupHistoryEntries(
      [expense("e1", "2026-01-15", 1000)],
      [income("i1", "2026-08-20", 2000)],
    );
    const trend = buildHistoryTrend(groups, {
      entryType: "all",
      startDate: "2026-01-15",
      endDate: "2026-08-20",
    });

    expect(trend[0]).toMatchObject({
      granularity: "month",
      startDate: "2026-01-15",
      endDate: "2026-01-31",
      totalExpenseYen: 1000,
    });
    expect(trend[trend.length - 1]).toMatchObject({
      granularity: "month",
      startDate: "2026-08-01",
      endDate: "2026-08-20",
      totalIncomeYen: 2000,
    });
  });

  it.each([
    ["0100-01-01", "9998-12-31"],
    ["2000-01-01", "9998-12-31"],
    ["2000-01-01", "2100-01-01"],
  ])("上限を超える期間 %s〜%s はトレンド生成を拒否する", (startDate, endDate) => {
    expect(() => buildHistoryTrend([], { entryType: "all", startDate, endDate })).toThrow(
      ExpenseSearchDomainError,
    );
  });

  it.each([{}, { startDate: "2000-01-01" }, { endDate: "2100-01-01" }])(
    "履歴から補完した範囲にも上限を適用する: %j",
    (dates) => {
      const groups = groupHistoryEntries(
        [expense("first", "2000-01-01", 100), expense("last", "2100-01-01", 200)],
        [],
      );
      expect(() => buildHistoryTrend(groups, { entryType: "all", ...dates })).toThrow(
        ExpenseSearchDomainError,
      );
    },
  );

  it("上限の1200か月は最初と最後の値・空の月を維持する", () => {
    const groups = groupHistoryEntries(
      [expense("first", "2000-01-15", 100)],
      [income("last", "2099-12-20", 300)],
    );
    const trend = buildHistoryTrend(groups, {
      entryType: "all",
      startDate: "2000-01-15",
      endDate: "2099-12-20",
    });
    expect(trend).toHaveLength(1200);
    expect(trend[0]).toEqual({
      key: "2000-01-15",
      startDate: "2000-01-15",
      endDate: "2000-01-31",
      granularity: "month",
      totalExpenseYen: 100,
      totalIncomeYen: 0,
      netAmountYen: -100,
    });
    expect(trend[1]).toMatchObject({ totalExpenseYen: 0, totalIncomeYen: 0, netAmountYen: 0 });
    expect(trend.at(-1)).toMatchObject({
      startDate: "2099-12-01",
      endDate: "2099-12-20",
      totalIncomeYen: 300,
      netAmountYen: 300,
    });
  });

  it.each([
    ["2026-01-01", "2026-01-31", "day", 31],
    ["2026-01-01", "2026-02-01", "week", 5],
    ["2026-01-01", "2026-06-29", "week", 27],
    ["2026-01-01", "2026-06-30", "month", 6],
  ] as const)("%s〜%s の粒度境界を維持する", (startDate, endDate, granularity, count) => {
    const trend = buildHistoryTrend([], { entryType: "all", startDate, endDate });
    expect(trend).toHaveLength(count);
    expect(trend.every((point) => point.granularity === granularity)).toBe(true);
    expect(trend[0]?.startDate).toBe(startDate);
    expect(trend.at(-1)?.endDate).toBe(endDate);
  });

  it.each([
    ["2023-12-31", "2024-02-29", "week"],
    ["2023-12-31", "2024-06-30", "month"],
  ] as const)(
    "%s〜%s の年・閏日境界で範囲内の履歴を一度ずつ集計する",
    (startDate, endDate, granularity) => {
      const groups = groupHistoryEntries(
        [
          expense("outside-before", "2023-12-30", 999),
          expense("start", startDate, 100),
          expense("monday", "2024-01-01", 200),
          expense("leap", "2024-02-29", 300),
          expense("outside-after", "2024-07-01", 999),
        ],
        [income("end", endDate, 1000)],
      ).reverse();
      const trend = buildHistoryTrend(groups, { entryType: "all", startDate, endDate });
      expect(trend.every((point) => point.granularity === granularity)).toBe(true);
      expect(trend.reduce((sum, point) => sum + point.totalExpenseYen, 0)).toBe(600);
      expect(trend.reduce((sum, point) => sum + point.totalIncomeYen, 0)).toBe(1000);
      expect(trend.reduce((sum, point) => sum + point.netAmountYen, 0)).toBe(400);
      expect(trend[0]).toMatchObject({
        startDate,
        endDate: "2023-12-31",
        totalExpenseYen: 100,
      });
      expect(trend[1]?.startDate).toBe("2024-01-01");
      expect(trend.at(-1)?.endDate).toBe(endDate);
    },
  );

  it.each([
    ["0100-01-03", "day"],
    ["0100-02-01", "week"],
    ["0100-07-01", "month"],
  ] as const)("0100年の%sまでの集計で4桁の年を維持する", (endDate, granularity) => {
    const trend = buildHistoryTrend(
      groupHistoryEntries([expense("first", "0100-01-01", 100), expense("last", endDate, 200)], []),
      { entryType: "all", startDate: "0100-01-01", endDate },
    );
    expect(trend.at(-1)).toMatchObject({ endDate, granularity, totalExpenseYen: 200 });
    expect(trend.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.key))).toBe(true);
    expect(trend.reduce((sum, point) => sum + point.totalExpenseYen, 0)).toBe(300);
  });

  it.each(["day", "week", "month"] as const)(
    "9999年末の%s集計で範囲外へ日付を進めない",
    (granularity) => {
      const addDays = dateHelpers.addDays;
      const spy = vi.spyOn(dateHelpers, "addDays").mockImplementation((date, days) => {
        const result = addDays(date, days);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
          throw new Error("YYYY-MM-DDの範囲外への移動");
        }
        return result;
      });
      try {
        const startDate =
          granularity === "day"
            ? "9999-12-01"
            : granularity === "week"
              ? "9999-11-01"
              : "9999-01-01";
        const trend = buildHistoryTrend(
          groupHistoryEntries([expense("last", "9999-12-31", 100)], []),
          { entryType: "all", startDate, endDate: "9999-12-31" },
        );
        expect(trend.at(-1)).toMatchObject({
          endDate: "9999-12-31",
          granularity,
          totalExpenseYen: 100,
        });
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each([true, false])("日付指定=%sでもバケットごとに履歴を再走査しない", (explicitDates) => {
    const groups = groupHistoryEntries(
      [expense("first", "2026-01-01", 100), expense("last", "2026-12-31", 200)],
      [],
    );
    let dateReads = 0;
    for (const group of groups) {
      const date = group.date;
      Object.defineProperty(group, "date", {
        get: () => {
          dateReads += 1;
          return date;
        },
      });
    }
    const trend = buildHistoryTrend(groups, {
      entryType: "all",
      ...(explicitDates ? { startDate: "2026-01-01", endDate: "2026-12-31" } : {}),
    });
    expect(trend).toHaveLength(12);
    expect(trend.reduce((sum, point) => sum + point.totalExpenseYen, 0)).toBe(300);
    expect(dateReads).toBeLessThanOrEqual(groups.length * (explicitDates ? 1 : 2));
  });

  it("前期間を計算し、増減とカテゴリ変化を返す", () => {
    expect(calculatePreviousHistoryPeriod("2026-07-01", "2026-07-31")).toEqual({
      startDate: "2026-05-31",
      endDate: "2026-06-30",
    });

    const current = summarizeHistoryGroups(
      groupHistoryEntries(
        [expense("current", "2026-07-05", 1200)],
        [income("income", "2026-07-06", 3000)],
      ),
      categoryInfo,
    );
    const previous = summarizeHistoryGroups(
      groupHistoryEntries([expense("previous", "2026-06-05", 800, "food")], []),
      categoryInfo,
    );
    const comparison = buildHistoryComparison({
      current,
      currentStartDate: "2026-07-01",
      currentEndDate: "2026-07-31",
      previous,
      previousPeriod: { startDate: "2026-06-01", endDate: "2026-06-30" },
    });

    expect(comparison).toMatchObject({
      diffExpenseYen: 400,
      diffIncomeYen: 3000,
      diffNetYen: 2600,
      hasPreviousData: true,
    });
    expect(comparison.categoryChanges[0]).toMatchObject({
      categoryId: "food",
      currentAmountYen: 1200,
      previousAmountYen: 800,
      diffAmountYen: 400,
    });
  });

  it("前期間が0円のカテゴリは増減率を計算不能として返す", () => {
    const current = summarizeHistoryGroups(
      groupHistoryEntries([expense("current", "2026-07-05", 1200)], []),
      categoryInfo,
    );
    const previous = summarizeHistoryGroups([], categoryInfo);
    const comparison = buildHistoryComparison({
      current,
      currentStartDate: "2026-07-01",
      currentEndDate: "2026-07-31",
      previous,
      previousPeriod: { startDate: "2026-06-01", endDate: "2026-06-30" },
    });

    expect(comparison.hasPreviousData).toBe(false);
    expect(comparison.categoryChanges[0]).toMatchObject({
      categoryId: "food",
      diffRatePercent: null,
    });
  });
});
