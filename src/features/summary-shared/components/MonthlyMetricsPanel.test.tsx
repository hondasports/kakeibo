import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { MonthlyMetricsPanel } from "./MonthlyMetricsPanel";

describe("MonthlyMetricsPanel", () => {
  it("正の差引をプラス表記する", () => {
    renderWithProviders(
      <MonthlyMetricsPanel
        isLoading={false}
        netAmountYen={48800}
        totalAmountYen={1200}
        totalIncomeYen={50000}
      />,
    );

    expect(screen.getByLabelText("支出")).toHaveTextContent("1,200円");
    expect(screen.getByLabelText("収入")).toHaveTextContent("50,000円");
    expect(screen.getByLabelText("差引")).toHaveTextContent("+48,800円");
  });

  it("負の差引をマイナス表記する", () => {
    renderWithProviders(
      <MonthlyMetricsPanel
        isLoading={false}
        netAmountYen={-3500}
        totalAmountYen={6500}
        totalIncomeYen={3000}
      />,
    );

    expect(screen.getByLabelText("差引")).toHaveTextContent("−3,500円");
  });

  it("差引0円は符号を付けずに表示する", () => {
    renderWithProviders(
      <MonthlyMetricsPanel
        isLoading={false}
        netAmountYen={0}
        totalAmountYen={0}
        totalIncomeYen={0}
      />,
    );

    expect(screen.getByLabelText("差引")).toHaveTextContent("0円");
    expect(screen.getByLabelText("差引")).not.toHaveTextContent("+");
    expect(screen.getByLabelText("差引")).not.toHaveTextContent("−");
  });

  it("読み込み中は3つのスケルトンを表示する", () => {
    const { container } = renderWithProviders(
      <MonthlyMetricsPanel isLoading netAmountYen={0} totalAmountYen={0} totalIncomeYen={0} />,
    );

    expect(container.querySelectorAll('[data-testid="monthly-metric-skeleton"]')).toHaveLength(3);
    expect(screen.queryByLabelText("支出")).not.toBeInTheDocument();
  });
});
