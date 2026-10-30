import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InputPage } from "./InputPage";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../hooks/useInputPageWeek", () => ({
  useInputPageWeek: () => ({
    weekStartDate: "2026-06-15",
    weekEndDate: "2026-06-21",
    weekSession: { weekStartDate: "2026-06-15", weekEndDate: "2026-06-21", status: "draft" },
    sessionError: "",
    isLoading: false,
    isCurrentWeek: true,
    goToPreviousWeek: vi.fn(),
    goToNextWeek: vi.fn(),
  }),
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

describe("InputPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("保存済みの入力一覧を表示しない", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce({
      count: 1,
      receipts: [{ shopName: "テスト店舗" }],
    });
    render(<InputPage />);
    expect(screen.getByTestId("week-status")).toHaveTextContent("1");
    expect(screen.queryByText("テスト店舗")).not.toBeInTheDocument();
    expect(screen.queryByText("直近の入力")).not.toBeInTheDocument();
  });

  it("週集計の読み込み中は0件と表示しない", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce(undefined);

    render(<InputPage />);

    expect(screen.queryByTestId("week-status")).not.toBeInTheDocument();
  });
});
