import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { SummaryMetricsPanel } from "./SummaryMetricsPanel";

describe("SummaryMetricsPanel", () => {
  it("合計支出・前週差・直前2週平均との増減率を表示する", () => {
    renderWithProviders(
      <SummaryMetricsPanel
        totalAmountYen={38_420}
        totalIncomeYen={300_000}
        previousDiff={-3_340}
        averageRate={-5}
      />,
    );

    expect(screen.getByText("合計支出")).toBeInTheDocument();
    expect(screen.getByText("合計収入")).toBeInTheDocument();
    expect(screen.getByText("38,420円")).toBeInTheDocument();
    expect(screen.getByText("300,000円")).toBeInTheDocument();
    expect(screen.getByText("−3,340円")).toBeInTheDocument();
    expect(screen.getByText("−5%")).toBeInTheDocument();
    expect(screen.getByLabelText("前週差")).toHaveTextContent("−3,340円");
    expect(screen.getByText("直前2週平均との増減率")).toBeInTheDocument();
  });

  it("比較できない指標は比較データなしと表示する", () => {
    renderWithProviders(
      <SummaryMetricsPanel
        totalAmountYen={0}
        totalIncomeYen={0}
        previousDiff={null}
        averageRate={null}
      />,
    );

    expect(screen.getAllByText("比較データなし")).toHaveLength(2);
  });

  it("読込中は指標の代わりにSkeletonを表示する", () => {
    renderWithProviders(
      <SummaryMetricsPanel
        isLoading
        totalAmountYen={0}
        totalIncomeYen={0}
        previousDiff={null}
        averageRate={null}
      />,
    );

    expect(screen.getByTestId("weekly-summary-metrics-loading")).toBeInTheDocument();
    expect(screen.queryByText("合計支出")).not.toBeInTheDocument();
  });
});
