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
  WeekStatusPanel: ({ count }: { count: number }) => <div data-testid="week-status">{count}</div>,
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
