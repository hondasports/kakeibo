import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { DEFAULT_TEST_VIEWPORT_WIDTH, stubViewportWidth } from "../../../test/viewport";
import { WeekComparisonChart } from "./WeekComparisonChart";

describe("WeekComparisonChart", () => {
  beforeEach(() => {
    stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("前週と今週の比較グラフと差額を表示する", () => {
    renderWithProviders(
      <WeekComparisonChart
        currentTotalAmountYen={38420}
        isLoading={false}
        prevWeekTotalAmountYen={41760}
      />,
    );

    expect(screen.getByRole("heading", { name: "前週との比較" })).toBeInTheDocument();
    expect(screen.getByText("差額 -3,340円 (-8%)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "前週との比較グラフ" })).toBeInTheDocument();
    expect(screen.getByText("38,420円")).toBeInTheDocument();
    expect(screen.getByText("41,760円")).toBeInTheDocument();
  });

  it("両週0円のとき空状態を表示する", () => {
    renderWithProviders(
      <WeekComparisonChart
        currentTotalAmountYen={0}
        isLoading={false}
        prevWeekTotalAmountYen={null}
      />,
    );

    expect(screen.getByTestId("week-comparison-empty")).toBeInTheDocument();
    expect(screen.getByText("前週との比較データがあると表示されます")).toBeInTheDocument();
  });

  it("読み込み中はスケルトンを表示する", () => {
    renderWithProviders(
      <WeekComparisonChart
        currentTotalAmountYen={0}
        isLoading={true}
        prevWeekTotalAmountYen={null}
      />,
    );

    expect(screen.getByTestId("week-comparison-loading")).toBeInTheDocument();
  });

  it("前週データがない場合は空状態を表示する", () => {
    renderWithProviders(
      <WeekComparisonChart
        currentTotalAmountYen={5000}
        isLoading={false}
        prevWeekTotalAmountYen={null}
      />,
    );

    expect(screen.getByTestId("week-comparison-empty")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "前週との比較グラフ" })).not.toBeInTheDocument();
  });
});
