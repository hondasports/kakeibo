import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { WeeklyTrendChart } from "./WeeklyTrendChart";
import { buildWeeklyExpenseChartData } from "../utils/weeklyExpenseChartData";

const chartData = buildWeeklyExpenseChartData({
  currentWeekStartDate: "2026-06-15",
  targetWeekStartDate: "2026-06-15",
  weeks: [
    {
      weekStartDate: "2026-06-01",
      totalAmountYen: 10_000,
      byCategory: [
        {
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#8B5E3C",
          totalAmountYen: 10_000,
        },
      ],
    },
    {
      weekStartDate: "2026-06-08",
      totalAmountYen: 12_000,
      byCategory: [
        {
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#8B5E3C",
          totalAmountYen: 12_000,
        },
      ],
    },
    {
      weekStartDate: "2026-06-15",
      totalAmountYen: 15_000,
      byCategory: [
        {
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#8B5E3C",
          totalAmountYen: 10_000,
        },
        {
          categoryId: "cat-daily",
          categoryName: "日用品",
          categoryColor: "#A6B28B",
          totalAmountYen: 5_000,
        },
      ],
    },
  ],
});

describe("WeeklyTrendChart", () => {
  it("週別棒グラフ・合計・週範囲・カテゴリ凡例を表示する", () => {
    renderWithProviders(<WeeklyTrendChart chartData={chartData} />);

    expect(screen.getByRole("heading", { name: "週別支出推移" })).toBeInTheDocument();
    expect(screen.getByText("15,000円")).toBeInTheDocument();
    expect(screen.getByText("6/15〜6/21")).toBeInTheDocument();
    expect(screen.getByText("食費")).toBeInTheDocument();
    expect(screen.getByText("日用品")).toBeInTheDocument();
    expect(screen.getByTestId("weekly-expense-trend-chart")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "週別支出推移グラフ" })).toBeInTheDocument();
  });

  it("チャートの高さは220pxで固定する", () => {
    renderWithProviders(<WeeklyTrendChart chartData={chartData} />);

    expect(screen.getByRole("img", { name: "週別支出推移グラフ" })).toHaveAttribute(
      "data-chart-height",
      "220",
    );
  });

  it("Y軸の金額を直感的な円・万円表記で表示する", () => {
    renderWithProviders(<WeeklyTrendChart chartData={chartData} />);

    expect(screen.queryByText(/千円$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("1万円").length).toBeGreaterThan(0);
  });

  it("Y軸の目盛りは1本の軸の中で円と万円を混ぜない", () => {
    const { container } = renderWithProviders(<WeeklyTrendChart chartData={chartData} />);

    const tickLabels = Array.from(
      container.querySelectorAll('[data-testid="weekly-expense-trend-chart"] svg text'),
    )
      .map((node) => node.textContent ?? "")
      .filter((text) => text.endsWith("円"));

    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels.every((text) => text.endsWith("万円"))).toBe(true);
  });

  it("全週0円のとき空状態を表示する", () => {
    renderWithProviders(
      <WeeklyTrendChart
        chartData={{
          ...chartData,
          items: chartData.items.map((item) => ({ ...item, amount: 0 })),
        }}
      />,
    );

    expect(screen.getByTestId("weekly-expense-trend-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("weekly-expense-trend-chart")).not.toBeInTheDocument();
  });

  it("isLoadingがtrueのとき見出しとSkeletonを表示する", () => {
    renderWithProviders(<WeeklyTrendChart isLoading />);

    expect(screen.getByTestId("weekly-expense-trend-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("weekly-expense-trend-chart")).not.toBeInTheDocument();
  });
});
