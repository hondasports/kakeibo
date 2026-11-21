import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_VIEWPORT_WIDTH, stubViewportWidth } from "../../../test/viewport";
import { DashboardPage } from "./DashboardPage";

const useQueryMock = vi.fn();
const retrySessionMock = vi.fn();

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
  beforeEach(() => {
    stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
    useQueryMock.mockReset();
    useWeekSessionMock.mockReturnValue({
      isLoading: false,
      retrySession: retrySessionMock,
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
      isLoading: true,
      retrySession: retrySessionMock,
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

  it("セッションエラー時はエラーと再試行ボタンを表示し、再試行を実行できる", async () => {
    const user = userEvent.setup();
    useWeekSessionMock.mockReturnValue({
      isLoading: false,
      retrySession: retrySessionMock,
      sessionError: "週次セッションの読み込みに失敗しました。もう一度お試しください。",
      setWeekSession: vi.fn(),
      weekSession: null,
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("週次セッションの読み込みに失敗しました。もう一度お試しください。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(retrySessionMock).toHaveBeenCalledOnce();
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
    stubViewportWidth(390);
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

    expect(screen.getByRole("heading", { name: "今週のダッシュボード" })).toBeInTheDocument();
    expect(screen.getByText(/集計期間：6\/15（月）〜6\/21（日）/)).toBeInTheDocument();
    const inputPanel = screen
      .getByRole("link", { name: "入力を再開" })
      .closest(".dashboard-input-panel--compact");
    const categoryHeading = screen.getByRole("heading", { name: "支出カテゴリ" });
    const comparisonChart = screen.getByTestId("week-comparison-chart");
    expect(inputPanel).not.toBeNull();
    expect(
      inputPanel!.compareDocumentPosition(categoryHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // 入力導線は比較グラフより前（サマリー行の直下）に置く
    expect(
      inputPanel!.compareDocumentPosition(comparisonChart) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /^今月の月次サマリーを見る/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^今年の年次サマリーを見る/ })).toBeInTheDocument();
  });

  it("完了済みの週では週次サマリーへの重複導線を表示しない", () => {
    stubViewportWidth(390);
    useQueryMock.mockReturnValue({
      byCategory: [],
      count: 3,
      prevWeekTotalAmountYen: 7000,
      totalAmountYen: 6280,
    });
    useWeekSessionMock.mockReturnValue({
      isLoading: false,
      retrySession: retrySessionMock,
      sessionError: "",
      setWeekSession: vi.fn(),
      weekSession: {
        status: "completed",
        weekEndDate: "2026-06-21",
        weekStartDate: "2026-06-15",
      },
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    // 主ボタンだけが週次サマリー導線になり、下部の同名リンクは出ない
    expect(screen.getAllByRole("link", { name: "今週のサマリーを見る" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /^今月の月次サマリーを見る/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^今年の年次サマリーを見る/ })).toBeInTheDocument();
  });

  it("サマリー取得に失敗しても見出しを残してセクション内エラーと再試行を表示する", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useQueryMock.mockImplementation(() => {
      throw new Error("summary failure");
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "今週のダッシュボード" })).toBeInTheDocument();
    expect(screen.getByText("今週のサマリーを読み込めませんでした。")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "再試行" });

    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({
      byCategory: [],
      count: 0,
      prevWeekTotalAmountYen: null,
      totalAmountYen: 0,
    });
    await user.click(retryButton);

    expect(screen.queryByText("今週のサマリーを読み込めませんでした。")).not.toBeInTheDocument();
    consoleErrorSpy.mockRestore();
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
