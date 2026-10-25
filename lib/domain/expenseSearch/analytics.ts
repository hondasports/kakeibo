import { addDays, getMonthEndDate } from "../common/date";
import { calculateWeekStartDate } from "../week/weekDates";
import type { CategorySummary } from "../receipt/summary";
import type { ExpenseSearchFilters, SearchableHistoryGroup } from "./filter";
import { ExpenseSearchDomainError } from "./searchResult";
import { getHistoryTrendRangeError } from "./trendRange";

export type HistoryCategoryInfo = {
  name: string;
  color: string;
};

export const HISTORY_OTHER_CATEGORY_ID = "__other__";

export type HistoryAggregate = {
  count: number;
  expenseCount: number;
  incomeCount: number;
  totalExpenseYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
  byCategory: CategorySummary[];
};

export type HistoryTrendGranularity = "day" | "week" | "month";

export type HistoryTrendPoint = {
  key: string;
  startDate: string;
  endDate: string;
  granularity: HistoryTrendGranularity;
  totalExpenseYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
};

export type PreviousHistoryPeriod = {
  startDate: string;
  endDate: string;
};

export type HistoryCategoryChange = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  currentAmountYen: number;
  previousAmountYen: number;
  diffAmountYen: number;
  diffRatePercent: number | null;
};

export type HistoryComparison = {
  currentStartDate: string;
  currentEndDate: string;
  previousStartDate: string;
  previousEndDate: string;
  current: HistoryAggregate;
  previous: HistoryAggregate;
  diffExpenseYen: number;
  diffIncomeYen: number;
  diffNetYen: number;
  categoryChanges: HistoryCategoryChange[];
  hasPreviousData: boolean;
};

export function buildHistoryCategoryBreakdown(
  categories: CategorySummary[],
  limit = 5,
): CategorySummary[] {
  const topCategories = categories.slice(0, Math.max(0, limit));
  const remainingCategories = categories.slice(Math.max(0, limit));
  if (remainingCategories.length === 0) {
    return topCategories;
  }

  return [
    ...topCategories,
    {
      categoryId: HISTORY_OTHER_CATEGORY_ID,
      categoryName: "その他",
      categoryColor: "#9E9E9E",
      totalAmountYen: remainingCategories.reduce(
        (total, category) => total + category.totalAmountYen,
        0,
      ),
      count: remainingCategories.reduce((total, category) => total + category.count, 0),
    },
  ];
}

function categoryInfo(
  categoryId: string,
  categoryInfoMap: Map<string, HistoryCategoryInfo>,
): HistoryCategoryInfo {
  return categoryInfoMap.get(categoryId) ?? { name: "不明", color: "#AAB7C4" };
}

export function summarizeHistoryGroups(
  groups: SearchableHistoryGroup[],
  categoryInfoMap: Map<string, HistoryCategoryInfo>,
): HistoryAggregate {
  const categoryMap = new Map<
    string,
    { categoryName: string; categoryColor: string; totalAmountYen: number; count: number }
  >();
  let totalExpenseYen = 0;
  let totalIncomeYen = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const group of groups) {
    if (group.type === "income") {
      totalIncomeYen += group.amountYen;
      incomeCount += 1;
      continue;
    }

    totalExpenseYen += group.amountYen;
    expenseCount += 1;
    for (const item of group.items) {
      const info = categoryInfo(item.categoryId, categoryInfoMap);
      const current = categoryMap.get(item.categoryId);
      if (current === undefined) {
        categoryMap.set(item.categoryId, {
          categoryName: info.name,
          categoryColor: info.color,
          totalAmountYen: item.amountYen,
          count: 1,
        });
      } else {
        current.totalAmountYen += item.amountYen;
        current.count += 1;
      }
    }
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.categoryName,
      categoryColor: data.categoryColor,
      totalAmountYen: data.totalAmountYen,
      count: data.count,
    }))
    .sort(
      (left, right) =>
        right.totalAmountYen - left.totalAmountYen ||
        left.categoryName.localeCompare(right.categoryName),
    );

  return {
    count: expenseCount + incomeCount,
    expenseCount,
    incomeCount,
    totalExpenseYen,
    totalIncomeYen,
    netAmountYen: totalIncomeYen - totalExpenseYen,
    byCategory,
  };
}

function getDateRange(
  groups: SearchableHistoryGroup[],
  filters: ExpenseSearchFilters,
): PreviousHistoryPeriod | null {
  let firstDate: string | undefined;
  let lastDate: string | undefined;
  if (filters.startDate === undefined || filters.endDate === undefined) {
    for (const group of groups) {
      const date = group.date;
      if (firstDate === undefined || date < firstDate) firstDate = date;
      if (lastDate === undefined || date > lastDate) lastDate = date;
    }
  }
  const startDate = filters.startDate ?? firstDate;
  const endDate = filters.endDate ?? lastDate;
  if (startDate === undefined || endDate === undefined || startDate > endDate) {
    return null;
  }
  return { startDate, endDate };
}

function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function chooseHistoryTrendGranularity(
  startDate: string,
  endDate: string,
): HistoryTrendGranularity {
  const days = inclusiveDayCount(startDate, endDate);
  if (days <= 31) {
    return "day";
  }
  if (days <= 180) {
    return "week";
  }
  return "month";
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function nextMonthStart(monthStartDate: string): string {
  const nextDay = addDays(getMonthEndDate(monthStartDate), 1).padStart(10, "0");
  return `${nextDay.slice(0, 7)}-01`;
}

function buildTrendBuckets(
  startDate: string,
  endDate: string,
  granularity: HistoryTrendGranularity,
): Array<{ startDate: string; endDate: string }> {
  const buckets: Array<{ startDate: string; endDate: string }> = [];
  let cursor =
    granularity === "day"
      ? startDate
      : granularity === "week"
        ? calculateWeekStartDate(startDate, 1).padStart(10, "0")
        : `${startDate.slice(0, 7)}-01`;

  while (cursor <= endDate) {
    const rawEndDate =
      granularity === "day"
        ? cursor
        : granularity === "week"
          ? addDays(cursor, Math.min(6, inclusiveDayCount(cursor, endDate) - 1)).padStart(10, "0")
          : getMonthEndDate(cursor);
    buckets.push({
      startDate: maxDate(cursor, startDate),
      endDate: minDate(rawEndDate, endDate),
    });
    if (rawEndDate >= endDate) {
      break;
    }
    cursor =
      granularity === "day"
        ? addDays(cursor, 1).padStart(10, "0")
        : granularity === "week"
          ? addDays(cursor, 7).padStart(10, "0")
          : nextMonthStart(cursor);
  }

  return buckets;
}

export function buildHistoryTrend(
  groups: SearchableHistoryGroup[],
  filters: ExpenseSearchFilters,
): HistoryTrendPoint[] {
  const range = getDateRange(groups, filters);
  if (range === null) {
    return [];
  }

  const trendRangeError = getHistoryTrendRangeError(range.startDate, range.endDate);
  if (trendRangeError !== null) {
    throw new ExpenseSearchDomainError(trendRangeError);
  }

  const granularity = chooseHistoryTrendGranularity(range.startDate, range.endDate);
  const points: HistoryTrendPoint[] = buildTrendBuckets(
    range.startDate,
    range.endDate,
    granularity,
  ).map((bucket) => ({
    key: bucket.startDate,
    startDate: bucket.startDate,
    endDate: bucket.endDate,
    granularity,
    totalExpenseYen: 0,
    totalIncomeYen: 0,
    netAmountYen: 0,
  }));
  const bucketKey = (date: string) =>
    granularity === "day"
      ? date
      : granularity === "week"
        ? calculateWeekStartDate(date, 1).padStart(10, "0")
        : date.slice(0, 7);
  const pointByKey = new Map(points.map((point) => [bucketKey(point.startDate), point]));

  for (const group of groups) {
    const date = group.date;
    if (date < range.startDate || date > range.endDate) {
      continue;
    }
    const point = pointByKey.get(bucketKey(date));
    if (point === undefined) {
      continue;
    }
    if (group.type === "income") {
      point.totalIncomeYen += group.amountYen;
    } else {
      point.totalExpenseYen += group.amountYen;
    }
  }
  for (const point of points) {
    point.netAmountYen = point.totalIncomeYen - point.totalExpenseYen;
  }
  return points;
}

export function calculatePreviousHistoryPeriod(
  startDate: string | undefined,
  endDate: string | undefined,
): PreviousHistoryPeriod | null {
  if (startDate === undefined || endDate === undefined || startDate > endDate) {
    return null;
  }

  const days = inclusiveDayCount(startDate, endDate);
  const previousEndDate = addDays(startDate, -1);
  return {
    startDate: addDays(previousEndDate, -(days - 1)),
    endDate: previousEndDate,
  };
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export function buildHistoryComparison({
  current,
  currentStartDate,
  currentEndDate,
  previous,
  previousPeriod,
}: {
  current: HistoryAggregate;
  currentStartDate: string;
  currentEndDate: string;
  previous: HistoryAggregate;
  previousPeriod: PreviousHistoryPeriod;
}): HistoryComparison {
  const previousByCategory = new Map(
    previous.byCategory.map((category) => [category.categoryId, category]),
  );
  const currentByCategory = new Map(
    current.byCategory.map((category) => [category.categoryId, category]),
  );
  const categoryIds = new Set([...currentByCategory.keys(), ...previousByCategory.keys()]);
  const categoryChanges = Array.from(categoryIds)
    .map((categoryId) => {
      const currentCategory = currentByCategory.get(categoryId);
      const previousCategory = previousByCategory.get(categoryId);
      const currentAmountYen = currentCategory?.totalAmountYen ?? 0;
      const previousAmountYen = previousCategory?.totalAmountYen ?? 0;
      return {
        categoryId,
        categoryName: currentCategory?.categoryName ?? previousCategory?.categoryName ?? "不明",
        categoryColor:
          currentCategory?.categoryColor ?? previousCategory?.categoryColor ?? "#AAB7C4",
        currentAmountYen,
        previousAmountYen,
        diffAmountYen: currentAmountYen - previousAmountYen,
        diffRatePercent: percentageChange(currentAmountYen, previousAmountYen),
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.diffAmountYen) - Math.abs(left.diffAmountYen) ||
        left.categoryName.localeCompare(right.categoryName),
    )
    .slice(0, 5);

  return {
    currentStartDate,
    currentEndDate,
    previousStartDate: previousPeriod.startDate,
    previousEndDate: previousPeriod.endDate,
    current,
    previous,
    diffExpenseYen: current.totalExpenseYen - previous.totalExpenseYen,
    diffIncomeYen: current.totalIncomeYen - previous.totalIncomeYen,
    diffNetYen: current.netAmountYen - previous.netAmountYen,
    categoryChanges,
    hasPreviousData: previous.count > 0,
  };
}
