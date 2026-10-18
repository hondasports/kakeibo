import type { YearlySummary } from "../../../../lib/domain/receipt/yearlySummary";
import { formatYen } from "../../../../lib/domain/common/currency";

export const OTHER_SERIES_DATA_KEY = "__yearly_other__";
export const MAX_STACKED_CATEGORIES = 5;
const OTHER_CATEGORY_COLOR = "#AAB7C4";

export type YearlyChartSeries = {
  dataKey: string;
  label: string;
  color: string;
};

export type YearlyTrendChartData = {
  labels: string[];
  expense: number[];
  income: number[];
  series: YearlyChartSeries[];
  dataset: Array<Record<string, string | number>>;
};

export type YearlyBalanceLineSeries = {
  color: string;
  dataKey: string;
  label: string;
  valueFormatter: (value: number | null, context: { dataIndex: number }) => string;
};

export type YearlyCategoryLineSeries = {
  area: true;
  color: string;
  dataKey: string;
  label: string;
  stack: "category";
};

export function toSeriesDataKey(categoryId: string): string {
  return `c:${encodeURIComponent(categoryId)}`;
}

function buildStackedSeries(summary: YearlySummary): YearlyChartSeries[] {
  const ranked = [...summary.byCategory].sort((a, b) => b.totalAmountYen - a.totalAmountYen);
  const top = ranked.slice(0, MAX_STACKED_CATEGORIES);
  const series = top.map((category) => ({
    dataKey: toSeriesDataKey(category.categoryId),
    label: category.categoryName,
    color: category.categoryColor,
  }));

  if (ranked.length > MAX_STACKED_CATEGORIES) {
    series.push({
      dataKey: OTHER_SERIES_DATA_KEY,
      label: "その他",
      color: OTHER_CATEGORY_COLOR,
    });
  }

  return series;
}

export function buildYearlyTrendChartData(summary: YearlySummary): YearlyTrendChartData {
  const labels = summary.months.map((month) => `${Number(month.month.slice(5))}月`);
  const expense = summary.months.map((month) => month.totalAmountYen);
  const income = summary.months.map((month) => month.totalIncomeYen);
  const series = buildStackedSeries(summary);
  const topCategoryIds = new Set(
    series.map((entry) => entry.dataKey).filter((dataKey) => dataKey !== OTHER_SERIES_DATA_KEY),
  );
  const includesOther = series.some((entry) => entry.dataKey === OTHER_SERIES_DATA_KEY);

  const dataset = summary.months.map((month, index) => {
    const row: Record<string, string | number> = {
      label: labels[index] ?? "",
      expense: month.totalAmountYen,
      income: month.totalIncomeYen,
    };

    for (const entry of series) {
      row[entry.dataKey] = 0;
    }

    for (const category of month.byCategory) {
      const dataKey = toSeriesDataKey(category.categoryId);
      if (topCategoryIds.has(dataKey)) {
        row[dataKey] = category.totalAmountYen;
      } else if (includesOther) {
        row[OTHER_SERIES_DATA_KEY] = Number(row[OTHER_SERIES_DATA_KEY]) + category.totalAmountYen;
      }
    }

    return row;
  });

  return { labels, expense, income, series, dataset };
}

export function formatYearlyBalanceTooltip(
  monthLabel: string,
  expenseYen: number,
  incomeYen: number,
): string {
  return `${monthLabel}｜支出 ${formatYen(expenseYen)}｜収入 ${formatYen(incomeYen)}`;
}

export function formatYearlyBalanceSeriesValue(
  labels: string[],
  expense: number[],
  income: number[],
  dataIndex: number,
): string {
  return formatYearlyBalanceTooltip(
    labels[dataIndex] ?? "",
    expense[dataIndex] ?? 0,
    income[dataIndex] ?? 0,
  );
}

export function buildYearlyLineSeries(
  mode: "balance",
  chartData: YearlyTrendChartData,
  colors: { expense: string; income: string },
): YearlyBalanceLineSeries[];
export function buildYearlyLineSeries(
  mode: "category",
  chartData: YearlyTrendChartData,
  colors: { expense: string; income: string },
): YearlyCategoryLineSeries[];
export function buildYearlyLineSeries(
  mode: "balance" | "category",
  chartData: YearlyTrendChartData,
  colors: { expense: string; income: string },
): YearlyBalanceLineSeries[] | YearlyCategoryLineSeries[];
export function buildYearlyLineSeries(
  mode: "balance" | "category",
  chartData: YearlyTrendChartData,
  colors: { expense: string; income: string },
): YearlyBalanceLineSeries[] | YearlyCategoryLineSeries[] {
  if (mode === "balance") {
    return [
      {
        color: colors.expense,
        dataKey: "expense",
        label: "支出",
        valueFormatter: (_value: number | null, context: { dataIndex: number }) =>
          formatYearlyBalanceSeriesValue(
            chartData.labels,
            chartData.expense,
            chartData.income,
            context.dataIndex,
          ),
      },
      {
        color: colors.income,
        dataKey: "income",
        label: "収入",
        valueFormatter: (_value: number | null, context: { dataIndex: number }) =>
          formatYearlyBalanceSeriesValue(
            chartData.labels,
            chartData.expense,
            chartData.income,
            context.dataIndex,
          ),
      },
    ];
  }

  return chartData.series.map((entry): YearlyCategoryLineSeries => ({
    area: true,
    color: entry.color,
    dataKey: entry.dataKey,
    label: entry.label,
    stack: "category",
  }));
}
