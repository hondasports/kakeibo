import { calculateWeekEndDate } from "../../../../lib/domain/week/weekDates";
import { formatYen } from "../../../../lib/domain/common/currency";
import { formatDateForDisplay } from "../../../utils/date";

export type WeeklyCategoryBreakdown = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalAmountYen: number;
};

export type WeeklyExpenseChartItem = {
  weekStartDate: string;
  weekEndDate: string;
  label: string;
  amount: number;
  previousDiff: number | null;
  averageDiff: number | null;
  averageRate: number | null;
  byCategory: WeeklyCategoryBreakdown[];
};

export type WeeklyExpenseChartSeries = {
  dataKey: string;
  label: string;
  color: string;
};

export type WeeklyExpenseChartData = {
  items: WeeklyExpenseChartItem[];
  series: WeeklyExpenseChartSeries[];
  dataset: Array<Record<string, string | number>>;
};

type WeeklyExpenseSource = {
  weekStartDate: string;
  totalAmountYen: number;
  byCategory?: WeeklyCategoryBreakdown[];
};

export const OTHER_CATEGORY_ID = "__other__";
export const MAX_STACKED_CATEGORIES = 5;
const OTHER_CATEGORY_COLOR = "#AAB7C4";

export function toSeriesDataKey(categoryId: string): string {
  return `series_${categoryId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function buildStackedSeries(displayWeeks: WeeklyExpenseSource[]): WeeklyExpenseChartSeries[] {
  const categoryTotals = new Map<
    string,
    { categoryName: string; categoryColor: string; totalAmountYen: number }
  >();

  for (const week of displayWeeks) {
    for (const category of week.byCategory ?? []) {
      const current = categoryTotals.get(category.categoryId);
      if (current === undefined) {
        categoryTotals.set(category.categoryId, {
          categoryName: category.categoryName,
          categoryColor: category.categoryColor,
          totalAmountYen: category.totalAmountYen,
        });
      } else {
        current.totalAmountYen += category.totalAmountYen;
      }
    }
  }

  const rankedCategories = Array.from(categoryTotals.entries()).sort(
    (a, b) => b[1].totalAmountYen - a[1].totalAmountYen,
  );

  const topCategories = rankedCategories.slice(0, MAX_STACKED_CATEGORIES);
  const series = topCategories.map(([categoryId, category]) => ({
    dataKey: toSeriesDataKey(categoryId),
    label: category.categoryName,
    color: category.categoryColor,
  }));

  if (rankedCategories.length > MAX_STACKED_CATEGORIES) {
    series.push({
      dataKey: toSeriesDataKey(OTHER_CATEGORY_ID),
      label: "その他",
      color: OTHER_CATEGORY_COLOR,
    });
  }

  return series;
}

function buildStackedDataset({
  items,
  displayWeeks,
  series,
}: {
  items: WeeklyExpenseChartItem[];
  displayWeeks: WeeklyExpenseSource[];
  series: WeeklyExpenseChartSeries[];
}): Array<Record<string, string | number>> {
  const topCategoryIds = new Set(
    series
      .map((entry) => entry.dataKey)
      .filter((dataKey) => dataKey !== toSeriesDataKey(OTHER_CATEGORY_ID)),
  );
  const includesOther = series.some(
    (entry) => entry.dataKey === toSeriesDataKey(OTHER_CATEGORY_ID),
  );

  return items.map((item) => {
    const weekSource = displayWeeks.find((week) => week.weekStartDate === item.weekStartDate);
    const row: Record<string, string | number> = { label: item.label };

    for (const seriesEntry of series) {
      row[seriesEntry.dataKey] = 0;
    }

    for (const category of weekSource?.byCategory ?? []) {
      const dataKey = toSeriesDataKey(category.categoryId);
      if (topCategoryIds.has(dataKey)) {
        row[dataKey] = category.totalAmountYen;
      } else if (includesOther) {
        const otherKey = toSeriesDataKey(OTHER_CATEGORY_ID);
        row[otherKey] = Number(row[otherKey]) + category.totalAmountYen;
      }
    }

    return row;
  });
}

export function buildWeeklyExpenseChartData({
  weeks,
  targetWeekStartDate,
  currentWeekStartDate,
}: {
  weeks: WeeklyExpenseSource[];
  targetWeekStartDate: string;
  currentWeekStartDate: string;
}): WeeklyExpenseChartData {
  const sortedWeeks = [...weeks].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
  const displayStartIndex = Math.max(0, sortedWeeks.length - 3);
  const displayWeeks = sortedWeeks.slice(displayStartIndex);
  const isCurrentWeek = targetWeekStartDate === currentWeekStartDate;

  const items = displayWeeks.map((week, displayIndex, displayedWeeks) => {
    const sourceIndex = displayStartIndex + displayIndex;
    const previousWeek = sortedWeeks[sourceIndex - 1];
    const averageSources = sortedWeeks.slice(Math.max(0, sourceIndex - 2), sourceIndex);
    const average =
      averageSources.length > 0
        ? averageSources.reduce((sum, item) => sum + item.totalAmountYen, 0) / averageSources.length
        : null;
    const distanceFromTarget = displayedWeeks.length - 1 - displayIndex;

    let label = `${formatDateForDisplay(week.weekStartDate)}週`;
    if (isCurrentWeek) {
      label =
        distanceFromTarget === 0
          ? "今週"
          : distanceFromTarget === 1
            ? "先週"
            : `${distanceFromTarget}週前`;
    }

    return {
      weekStartDate: week.weekStartDate,
      weekEndDate: calculateWeekEndDate(week.weekStartDate),
      label,
      amount: week.totalAmountYen,
      previousDiff: previousWeek ? week.totalAmountYen - previousWeek.totalAmountYen : null,
      averageDiff:
        average !== null && average !== 0 ? Math.round(week.totalAmountYen - average) : null,
      averageRate:
        average !== null && average !== 0
          ? Math.round(((week.totalAmountYen - average) / average) * 100)
          : null,
      byCategory: week.byCategory ?? [],
    };
  });

  const series = buildStackedSeries(displayWeeks);
  const dataset =
    series.length > 0
      ? buildStackedDataset({ items, displayWeeks, series })
      : items.map((item) => ({ label: item.label, amount: item.amount }));

  return { items, series, dataset };
}

export function formatWeeklyExpenseTooltip(item: WeeklyExpenseChartItem): string {
  const lines = [
    `${formatDateForDisplay(item.weekStartDate)}〜${formatDateForDisplay(item.weekEndDate)}`,
    `支出合計 ${formatYen(item.amount)}`,
  ];

  if (item.byCategory.length > 0) {
    const breakdown = item.byCategory
      .map((category) => `${category.categoryName} ${formatYen(category.totalAmountYen)}`)
      .join(" / ");
    lines.push(breakdown);
  }

  return lines.join("｜");
}
