import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type {
  HistoryComparison,
  HistoryTrendPoint,
} from "../../../../lib/domain/expenseSearch/analytics";
import { HistoryCategoryChart } from "./HistoryCategoryChart";
import { HistoryComparisonCard } from "./HistoryComparisonCard";
import { HistoryMetricsPanel } from "./HistoryMetricsPanel";
import { HistoryTrendChart } from "./HistoryTrendChart";

const trend: HistoryTrendPoint[] = [
  {
    key: "2026-08-01",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    granularity: "day",
    totalExpenseYen: 1200,
    totalIncomeYen: 3000,
    netAmountYen: 1800,
  },
];

const comparison: HistoryComparison = {
  currentStartDate: "2026-08-01",
  currentEndDate: "2026-08-31",
  previousStartDate: "2026-07-01",
  previousEndDate: "2026-07-31",
  current: {
    count: 2,
    expenseCount: 1,
    incomeCount: 1,
    totalExpenseYen: 1200,
    totalIncomeYen: 3000,
    netAmountYen: 1800,
    byCategory: [],
  },
  previous: {
    count: 1,
    expenseCount: 1,
    incomeCount: 0,
    totalExpenseYen: 800,
    totalIncomeYen: 0,
    netAmountYen: -800,
    byCategory: [],
  },
  diffExpenseYen: 400,
  diffIncomeYen: 3000,
  diffNetYen: 2600,
  categoryChanges: [
    {
      categoryId: "food",
      categoryName: "食費",
      categoryColor: "#f97316",
      currentAmountYen: 1200,
      previousAmountYen: 800,
      diffAmountYen: 400,
      diffRatePercent: 50,
    },
  ],
  hasPreviousData: true,
};

describe("履歴検索の分析表示", () => {
  it("件数・支出・収入・差引の指標を表示する", () => {
    renderWithProviders(
      <HistoryMetricsPanel
        expenseCount={2}
        incomeCount={1}
        netAmountYen={1500}
        totalCount={3}
        totalExpenseYen={1500}
        totalIncomeYen={3000}
      />,
    );

    expect(screen.getByLabelText("該当件数")).toHaveTextContent("3件");
    expect(screen.getByLabelText("支出")).toHaveTextContent("1,500円");
    expect(screen.getByLabelText("支出")).toHaveTextContent("2件の合計");
    expect(screen.getByLabelText("収入")).toHaveTextContent("3,000円");
    expect(screen.getByLabelText("差引")).toHaveTextContent("+1,500円");
    expect(screen.queryByText(/グループ/)).not.toBeInTheDocument();
  });

  it("期間推移とカテゴリ別の金額・構成比を表示する", () => {
    renderWithProviders(
      <>
        <HistoryTrendChart points={trend} />
        <HistoryCategoryChart
          categories={[
            {
              categoryId: "food",
              categoryName: "食費",
              categoryColor: "#f97316",
              totalAmountYen: 1200,
              count: 1,
            },
          ]}
        />
      </>,
    );

    expect(screen.getByRole("img", { name: "期間推移グラフ" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "カテゴリ別支出グラフ" })).toBeInTheDocument();
    expect(screen.getByText("1,200円（100%）")).toBeInTheDocument();
  });

  it("期間推移の読み込み中・空状態とカテゴリの空状態を表示する", () => {
    renderWithProviders(
      <>
        <HistoryTrendChart isLoading points={trend} />
        <HistoryTrendChart points={[]} />
        <HistoryCategoryChart categories={[]} />
      </>,
    );

    expect(screen.getByTestId("history-trend-chart-loading")).toBeInTheDocument();
    expect(screen.getByTestId("history-trend-chart-empty")).toBeInTheDocument();
    expect(screen.getByTestId("history-category-chart-empty")).toBeInTheDocument();
  });

  it("期間選択からキーボード操作で対象期間を選べる", async () => {
    const user = userEvent.setup();
    const onPointSelect = vi.fn();
    renderWithProviders(<HistoryTrendChart onPointSelect={onPointSelect} points={trend} />);

    await user.selectOptions(screen.getByLabelText("期間推移の期間選択"), trend[0].key);

    expect(onPointSelect).toHaveBeenCalledWith(trend[0]);
  });

  it("カテゴリ上位5件以外をその他として案内する", () => {
    const categories = Array.from({ length: 6 }, (_, index) => ({
      categoryId: `category-${index}`,
      categoryName: `カテゴリ${index}`,
      categoryColor: "#000000",
      totalAmountYen: 100,
      count: 1,
    }));
    renderWithProviders(
      <HistoryCategoryChart categories={categories} onCategorySelect={vi.fn()} />,
    );

    expect(
      within(screen.getByLabelText("カテゴリ別支出の詳細")).getByText("その他"),
    ).toBeInTheDocument();
    expect(screen.getByText(/その他を除く/)).toBeInTheDocument();
  });

  it("前期間の増減とカテゴリ増減率を表示する", () => {
    renderWithProviders(<HistoryComparisonCard comparison={comparison} />);

    expect(screen.getByRole("heading", { name: "前期間との比較" })).toBeInTheDocument();
    expect(screen.getByLabelText("支出の増減")).toHaveTextContent("+400円");
    expect(screen.getByText("+400円（+50%）")).toBeInTheDocument();
  });

  it("比較データがない場合は比較カードを表示しない", () => {
    renderWithProviders(<HistoryComparisonCard comparison={null} />);

    expect(screen.queryByTestId("history-comparison")).not.toBeInTheDocument();
  });

  it("前期間データなしと増減率計算不能を案内する", () => {
    const noPreviousData = { ...comparison, hasPreviousData: false };
    const zeroRate = {
      ...comparison,
      categoryChanges: [{ ...comparison.categoryChanges[0], diffRatePercent: null }],
    };
    renderWithProviders(
      <>
        <HistoryComparisonCard comparison={noPreviousData} />
        <HistoryComparisonCard comparison={zeroRate} />
      </>,
    );

    expect(screen.getByText("比較できる前期間のデータがありません")).toBeInTheDocument();
    expect(screen.getByText("+400円（—）")).toBeInTheDocument();
  });
});
