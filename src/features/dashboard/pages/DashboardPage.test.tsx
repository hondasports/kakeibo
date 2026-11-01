import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../hooks/useWeekSession", () => ({
  useWeekSession: vi.fn(),
}));

vi.mock("../../ui", () => ({
  AnimatedCounter: ({ suffix, value }: { suffix?: string; value: number }) => (
    <span>{`${value.toLocaleString("ja-JP")}${suffix ?? ""}`}</span>
  ),
  SuzumemoLoadingState: () => <div data-testid="loading">loading</div>,
}));

vi.mock("../components/WeekComparisonChart", () => ({
  WeekComparisonChart: () => <div data-testid="week-comparison-chart" />,
}));

import { useWeekSession } from "../hooks/useWeekSession";

const useWeekSessionMock = vi.mocked(useWeekSession);

describe("DashboardPage", () => {
  function setCompactViewport(matches: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    );
  }

  beforeEach(() => {
    useQueryMock.mockReset();
    useWeekSessionMock.mockReturnValue({
      sessionError: "",
      setWeekSession: vi.fn(),
      weekSession: {
        status: "draft",
        weekEndDate: "2026-06-21",
        weekStartDate: "2026-06-15",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("セッション読み込み中はローディングを表示する", () => {
    useWeekSessionMock.mockReturnValue({
      sessionError: "",
      setWeekSession: vi.fn(),
      weekSession: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("セッションエラー時はエラーを表示する", () => {
    useWeekSessionMock.mockReturnValue({
      sessionError: "週次セッションの初期化に失敗しました。",
      setWeekSession: vi.fn(),
      weekSession: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("週次セッションの初期化に失敗しました。")).toBeInTheDocument();
  });

  it("サマリー取得後に主要セクションを表示する", () => {
    useQueryMock.mockReturnValue({
      byCategory: [],
      count: 3,
      prevWeekTotalAmountYen: 7000,
      totalAmountYen: 6280,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "今週のダッシュボード" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "支出カテゴリ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "今週の入力" })).toBeInTheDocument();
    expect(screen.getByTestId("week-comparison-chart")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "入力を再開" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "今月の月次サマリーを見る ›" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/months\/\d{4}-\d{2}$/),
    );
    expect(screen.getByRole("link", { name: "今年の年次サマリーを見る ›" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/years\/\d{4}$/),
    );
  });

  it("コンパクト表示では期間行と月次リンクを表示する", () => {
    setCompactViewport(true);
    useQueryMock.mockReturnValue({
      byCategory: [
        {
          categoryId: "food",
          categoryName: "食費",
          categoryColor: "#123456",
          count: 1,
          totalAmountYen: 1200,
        },
      ],
      count: 1,
      prevWeekTotalAmountYen: 1000,
      totalAmountYen: 1200,
      totalIncomeYen: 2000,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "今週" })).toBeInTheDocument();
    expect(screen.getByText(/集計期間：6\/15（月）〜6\/21（日）/)).toBeInTheDocument();
    const inputPanel = screen
      .getByRole("link", { name: "入力を再開" })
      .closest(".dashboard-input-panel--compact");
    const categoryHeading = screen.getByRole("heading", { name: "支出カテゴリ" });
    expect(inputPanel).not.toBeNull();
    expect(
      inputPanel!.compareDocumentPosition(categoryHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /^今月の月次サマリーを見る/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^今年の年次サマリーを見る/ })).toBeInTheDocument();
  });

  it("サマリー読み込み中でもセッションの画面枠を表示する", () => {
    useQueryMock.mockReturnValue(undefined);

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "今週のダッシュボード" })).toBeInTheDocument();
    expect(screen.getByTestId("week-comparison-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(0);
  });
});
