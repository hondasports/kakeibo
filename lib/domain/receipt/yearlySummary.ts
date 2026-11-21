import { getYearMonths, normalizeYear } from "../common/year";
import { summarizeByCategory, summarizeReceipts, type CategorySummary } from "./summary";

export type YearlyMonthSource = {
  month: string;
  expenses: Array<{ amountYen: number; categoryId: string }>;
  incomes: Array<{ amountYen: number }>;
};

type YearlyMonthPoint = {
  month: string;
  totalAmountYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
  count: number;
  incomeCount: number;
  byCategory: CategorySummary[];
};

export type YearlySummary = {
  year: string;
  totalAmountYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
  count: number;
  incomeCount: number;
  byCategory: CategorySummary[];
  months: YearlyMonthPoint[];
};

export function summarizeYearlyTrend({
  year,
  months,
  categoryInfoMap,
}: {
  year: string;
  months: YearlyMonthSource[];
  categoryInfoMap: Map<string, { name: string; color: string }>;
}): YearlySummary {
  const normalizedYear = normalizeYear(year);
  if (normalizedYear === null) {
    throw new Error(`Invalid year: ${year}`);
  }

  const monthMap = new Map(months.map((month) => [month.month, month]));
  const allExpenses: Array<{ amountYen: number; categoryId: string }> = [];
  let totalIncomeYen = 0;
  let incomeCount = 0;

  const monthPoints = getYearMonths(normalizedYear).map((month) => {
    const source = monthMap.get(month);
    const expenses = source?.expenses ?? [];
    const incomes = source?.incomes ?? [];
    const { count, totalAmountYen } = summarizeReceipts(expenses);
    const monthIncomeYen = incomes.reduce((sum, income) => sum + income.amountYen, 0);

    allExpenses.push(...expenses);
    totalIncomeYen += monthIncomeYen;
    incomeCount += incomes.length;

    return {
      month,
      totalAmountYen,
      totalIncomeYen: monthIncomeYen,
      netAmountYen: monthIncomeYen - totalAmountYen,
      count,
      incomeCount: incomes.length,
      byCategory: summarizeByCategory(expenses, categoryInfoMap),
    };
  });

  const { count, totalAmountYen } = summarizeReceipts(allExpenses);

  return {
    year: normalizedYear,
    totalAmountYen,
    totalIncomeYen,
    netAmountYen: totalIncomeYen - totalAmountYen,
    count,
    incomeCount,
    byCategory: summarizeByCategory(allExpenses, categoryInfoMap),
    months: monthPoints,
  };
}
