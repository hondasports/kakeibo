import { describe, expect, it } from "vitest";
import {
  buildMonthlySpendingCalendarData,
  getExpenseIntensity,
  isDateInMonth,
  isFutureCalendarDate,
} from "./monthlySpendingCalendar";

describe("monthlySpendingCalendar", () => {
  it("月の日付を日曜始まりの7列へ並べ、支出と収入を日別に集計する", () => {
    const result = buildMonthlySpendingCalendarData({
      month: "2026-07",
      expenses: [
        { amountYen: 1200, date: "2026-07-01" },
        { amountYen: 800, date: "2026-07-01" },
        { amountYen: 5000, date: "2026-07-15" },
        { amountYen: 9999, date: "2026-08-01" },
      ],
      incomes: [
        { amountYen: 250000, date: "2026-07-25" },
        { amountYen: 10000, date: "2026-07-25" },
        { amountYen: 9999, date: "2026-08-01" },
      ],
    });

    expect(result.cells).toHaveLength(35);
    expect(result.cells[0]).toBeNull();
    expect(result.cells[3]).toMatchObject({ date: "2026-07-01", dayOfMonth: 1 });
    expect(result.days.find((day) => day.date === "2026-07-01")).toMatchObject({
      expenseAmountYen: 2000,
      expenseCount: 2,
      incomeAmountYen: 0,
      incomeCount: 0,
    });
    expect(result.days.find((day) => day.date === "2026-07-15")).toMatchObject({
      expenseAmountYen: 5000,
      expenseCount: 1,
    });
    expect(result.days.find((day) => day.date === "2026-07-25")).toMatchObject({
      expenseAmountYen: 0,
      incomeAmountYen: 260000,
      incomeCount: 2,
    });
    expect(result.maxExpenseAmountYen).toBe(5000);
  });

  it("支出額を最大額との相対値で0〜4の濃淡へ変換する", () => {
    expect(getExpenseIntensity(0, 5000)).toBe(0);
    expect(getExpenseIntensity(1, 5000)).toBe(1);
    expect(getExpenseIntensity(1250, 5000)).toBe(1);
    expect(getExpenseIntensity(1251, 5000)).toBe(2);
    expect(getExpenseIntensity(5000, 5000)).toBe(4);
    expect(getExpenseIntensity(5000, 0)).toBe(0);
  });

  it("日付が対象月に属するかを厳密に判定する", () => {
    expect(isDateInMonth("2026-07-31", "2026-07")).toBe(true);
    expect(isDateInMonth("2026-07-32", "2026-07")).toBe(false);
    expect(isDateInMonth("2026-08-01", "2026-07")).toBe(false);
    expect(isDateInMonth("2026-7-01", "2026-07")).toBe(false);
    expect(isDateInMonth("invalid", "2026-07")).toBe(false);
  });

  it("日付が今日より後かどうかを、今日当日を含めずに判定する", () => {
    expect(isFutureCalendarDate("2026-11-17", "2026-11-18")).toBe(false);
    expect(isFutureCalendarDate("2026-11-18", "2026-11-18")).toBe(false);
    expect(isFutureCalendarDate("2026-11-19", "2026-11-18")).toBe(true);
    // 月・年をまたぐ境界。
    expect(isFutureCalendarDate("2026-12-01", "2026-11-30")).toBe(true);
    expect(isFutureCalendarDate("2026-11-30", "2026-12-01")).toBe(false);
    expect(isFutureCalendarDate("2027-01-01", "2026-12-31")).toBe(true);
  });

  it("不正な月は空のカレンダーとして扱う", () => {
    expect(
      buildMonthlySpendingCalendarData({ month: "2026-13", expenses: [], incomes: [] }),
    ).toEqual({ cells: [], days: [], maxExpenseAmountYen: 0 });
  });
});
