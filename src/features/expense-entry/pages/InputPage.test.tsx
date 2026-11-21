import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputPage } from "./InputPage";

const useQueryMock = vi.fn();
const useInputPageWeekMock = vi.fn();
const retrySessionMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../hooks/useInputPageWeek", () => ({
  useInputPageWeek: () => useInputPageWeekMock(),
  WEEK_SESSION_LOAD_ERROR_MESSAGE:
    "週次セッションの読み込みに失敗しました。もう一度お試しください。",
}));

vi.mock("../../week", () => ({
  WeekNavigator: () => <div data-testid="week-navigator" />,
  WeekStatusPanel: ({
    count,
    totalAmountYen,
    weekStartDate,
    isCurrentWeek,
  }: {
    count: number;
    totalAmountYen: number;
    weekStartDate: string;
    isCurrentWeek: boolean;
  }) => (
    <div data-testid="week-status">
      {count}:{totalAmountYen}:{weekStartDate}:{String(isCurrentWeek)}
    </div>
  ),
}));

vi.mock("../components/ExpenseEntryForm", () => ({
  ExpenseEntryForm: () => <div data-testid="expense-entry-form" />,
}));

vi.mock("../../ui", () => ({
  SuzumemoLoadingState: () => <div data-testid="loading" />,
}));

const defaultWeek = {
  weekStartDate: "2026-06-15",
  weekEndDate: "2026-06-21",
  weekSession: { weekStartDate: "2026-06-15", weekEndDate: "2026-06-21", status: "draft" },
  sessionError: "",
  isLoading: false,
  isCurrentWeek: true,
  goToPreviousWeek: vi.fn(),
  goToNextWeek: vi.fn(),
  retrySession: retrySessionMock,
};

describe("InputPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useInputPageWeekMock.mockReset();
    retrySessionMock.mockReset();
    useInputPageWeekMock.mockReturnValue(defaultWeek);
  });

  it("週集計の読み込み中は0件と表示しない", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce(undefined);

    render(<InputPage />);

    expect(screen.queryByTestId("week-status")).not.toBeInTheDocument();
  });

  it("週集計の件数・合計金額・表示週を週ステータスへ渡す", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce({
      count: 3,
      totalAmountYen: 12345,
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
    });

    render(<InputPage />);

    expect(screen.getByTestId("week-status")).toHaveTextContent("3:12345:2026-06-15:true");
  });

  it("セッション読込エラー時はAlertと再試行ボタンを表示し、再試行を実行できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue([]);
    useInputPageWeekMock.mockReturnValue({
      ...defaultWeek,
      weekSession: null,
      sessionError: "週次セッションの読み込みに失敗しました。もう一度お試しください。",
    });

    render(<InputPage />);

    expect(
      screen.getByText("週次セッションの読み込みに失敗しました。もう一度お試しください。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(retrySessionMock).toHaveBeenCalledOnce();
  });
});
