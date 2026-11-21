import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { summarizeYearlyTrend } from "../../../../lib/domain/receipt/yearlySummary";
import { renderWithProviders } from "../../../test/render";
import { buildYearlyTrendChartData } from "../utils/yearlyTrendChartData";
import { YearlyTrendChart } from "./YearlyTrendChart";

const chartData = buildYearlyTrendChartData(
  summarizeYearlyTrend({
    year: "2026",
    months: [
      {
        month: "2026-08",
        expenses: [{ amountYen: 3000, categoryId: "food" }],
        incomes: [{ amountYen: 180000 }],
      },
    ],
    categoryInfoMap: new Map([["food", { name: "食費", color: "#8B5E3C" }]]),
  }),
);

describe("YearlyTrendChart", () => {
  it("収支の折れ線グラフを表示する", () => {
    renderWithProviders(
      <YearlyTrendChart chartData={chartData} mode="balance" onModeChange={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "月ごとの収支推移" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /月ごとの収支推移グラフ/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "収支の折れ線グラフ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("カテゴリ別の積み上げ面グラフへ切り替えられる", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    renderWithProviders(
      <YearlyTrendChart chartData={chartData} mode="balance" onModeChange={onModeChange} />,
    );

    await user.click(screen.getByRole("button", { name: /カテゴリ別の積み上げ面グラフ/ }));
    expect(onModeChange).toHaveBeenCalledWith("category");
  });

  it("データが無いときは空状態を表示する", () => {
    const emptyData = buildYearlyTrendChartData(
      summarizeYearlyTrend({
        year: "2026",
        months: [],
        categoryInfoMap: new Map(),
      }),
    );

    renderWithProviders(
      <YearlyTrendChart chartData={emptyData} mode="balance" onModeChange={vi.fn()} />,
    );

    expect(screen.getByTestId("yearly-trend-chart-empty")).toHaveTextContent(
      "月ごとの収支データがあると表示されます",
    );
  });

  it("読み込み中はスケルトンを表示する", () => {
    renderWithProviders(<YearlyTrendChart isLoading mode="balance" onModeChange={vi.fn()} />);

    expect(screen.getByTestId("yearly-trend-chart-loading")).toBeInTheDocument();
  });

  it("カテゴリ別グラフと空状態を表示する", () => {
    renderWithProviders(
      <YearlyTrendChart chartData={chartData} mode="category" onModeChange={vi.fn()} />,
    );
    expect(screen.getByRole("img", { name: /カテゴリ別の積み上げ面グラフ/ })).toBeInTheDocument();

    const emptyData = buildYearlyTrendChartData(
      summarizeYearlyTrend({
        year: "2026",
        months: [],
        categoryInfoMap: new Map(),
      }),
    );
    renderWithProviders(
      <YearlyTrendChart chartData={emptyData} mode="category" onModeChange={vi.fn()} />,
    );
    expect(screen.getByText("カテゴリ別の支出データがあると表示されます")).toBeInTheDocument();
  });

  it("Y軸の目盛りは1本の軸の中で円と万円を混ぜない", () => {
    const { container } = renderWithProviders(
      <YearlyTrendChart chartData={chartData} mode="balance" onModeChange={vi.fn()} />,
    );

    const tickLabels = Array.from(
      container.querySelectorAll('[data-testid="yearly-trend-chart"] svg text'),
    )
      .map((node) => node.textContent ?? "")
      .filter((text) => text.endsWith("円"));

    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels.every((text) => text.endsWith("万円"))).toBe(true);
  });

  it("カテゴリ別モードは描く支出の積み上げだけで軸を決め、収入の大きさで万円表記にしない", () => {
    const expenseOnlyData = buildYearlyTrendChartData(
      summarizeYearlyTrend({
        year: "2026",
        months: [
          {
            month: "2026-08",
            expenses: [{ amountYen: 300, categoryId: "food" }],
            incomes: [{ amountYen: 180000 }],
          },
        ],
        categoryInfoMap: new Map([["food", { name: "食費", color: "#8B5E3C" }]]),
      }),
    );
    const { container } = renderWithProviders(
      <YearlyTrendChart chartData={expenseOnlyData} mode="category" onModeChange={vi.fn()} />,
    );

    const tickLabels = Array.from(
      container.querySelectorAll('[data-testid="yearly-trend-chart"] svg text'),
    )
      .map((node) => node.textContent ?? "")
      .filter((text) => text.endsWith("円"));

    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels.some((text) => text.endsWith("万円"))).toBe(false);
  });

  it("chartDataが無くても空状態を表示する", () => {
    renderWithProviders(<YearlyTrendChart mode="balance" onModeChange={vi.fn()} />);
    expect(screen.getByTestId("yearly-trend-chart-empty")).toBeInTheDocument();
  });

  it("選択中の表示切替をもう一度押してもモードは変えない", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    renderWithProviders(
      <YearlyTrendChart chartData={chartData} mode="balance" onModeChange={onModeChange} />,
    );

    await user.click(screen.getByRole("button", { name: "収支の折れ線グラフ" }));
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
