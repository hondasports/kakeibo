import type { ComponentProps } from "react";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { DEFAULT_TEST_VIEWPORT_WIDTH, stubViewportWidth } from "../../../test/viewport";
import { DashboardSummaryRow } from "./DashboardSummaryRow";

function renderSummaryRow(props: ComponentProps<typeof DashboardSummaryRow>) {
  return renderWithProviders(
    <MemoryRouter>
      <DashboardSummaryRow {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DashboardSummaryRow", () => {
  it("今週の支出・入力済み・前週比を表示する", () => {
    renderSummaryRow({
      count: 12,
      currentTotalAmountYen: 38420,
      totalIncomeYen: 300000,
      isLoading: false,
      prevWeekTotalAmountYen: 41760,
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getByText("今週の支出")).toBeInTheDocument();
    expect(screen.getByText("今週の収入")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.getAttribute("data-value") === "38,420円"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.getAttribute("data-value") === "300,000円"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.getAttribute("data-value") === "12 件"),
    ).toBeInTheDocument();
    expect(screen.getByText("前週比")).toBeInTheDocument();
    expect(screen.getByText("92% ↓")).toBeInTheDocument();
  });

  it("前週データがない場合は前週データなしを表示する", () => {
    renderSummaryRow({
      count: 0,
      currentTotalAmountYen: 0,
      totalIncomeYen: 0,
      isLoading: false,
      prevWeekTotalAmountYen: null,
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getByText("前週データなし")).toBeInTheDocument();
  });

  it("前週より支出が増えた場合は増加表示にする", () => {
    renderSummaryRow({
      count: 2,
      currentTotalAmountYen: 5000,
      totalIncomeYen: 0,
      isLoading: false,
      prevWeekTotalAmountYen: 4000,
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getByText("125% ↑")).toBeInTheDocument();
  });

  it("前週と支出が同じ場合は同値表示にする", () => {
    renderSummaryRow({
      count: 2,
      currentTotalAmountYen: 4000,
      totalIncomeYen: 0,
      isLoading: false,
      prevWeekTotalAmountYen: 4000,
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("コンパクト表示では明細数と前週比を下段に表示する", () => {
    stubViewportWidth(390);

    renderSummaryRow({
      count: 3,
      currentTotalAmountYen: 1200,
      totalIncomeYen: 8000,
      isLoading: false,
      prevWeekTotalAmountYen: 1000,
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getByText("入力済み")).toBeInTheDocument();
    expect(screen.getByText("120% ↑")).toBeInTheDocument();
    expect(screen.queryByText("今週のサマリーを見る ›")).not.toBeInTheDocument();
  });

  it("完了済みの週はフッターの週次サマリーリンクを表示しない", () => {
    renderSummaryRow({
      count: 3,
      currentTotalAmountYen: 1200,
      totalIncomeYen: 8000,
      isLoading: false,
      prevWeekTotalAmountYen: 1000,
      status: "completed",
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.queryByRole("link", { name: "今週のサマリーを見る ›" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "今月の月次サマリーを見る ›" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "今年の年次サマリーを見る ›" })).toBeInTheDocument();
  });

  it("未完了の週はフッターの週次サマリーリンクを表示する", () => {
    renderSummaryRow({
      count: 3,
      currentTotalAmountYen: 1200,
      totalIncomeYen: 8000,
      isLoading: false,
      prevWeekTotalAmountYen: 1000,
      status: "draft",
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getByRole("link", { name: "今週のサマリーを見る ›" })).toHaveAttribute(
      "href",
      "/weeks/2026-06-15",
    );
  });

  it("ローディング中は金額・件数・前週比をスケルトンで表示する", () => {
    renderSummaryRow({
      count: 0,
      currentTotalAmountYen: 0,
      totalIncomeYen: 0,
      isLoading: true,
      prevWeekTotalAmountYen: null,
      weekEndDate: "2026-06-21",
      weekStartDate: "2026-06-15",
    });

    expect(screen.getAllByText("今週の支出")).toHaveLength(1);
    expect(screen.getByText("前週比")).toBeInTheDocument();
    expect(document.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(0);
    expect(screen.queryByText("0円")).not.toBeInTheDocument();
  });
});
