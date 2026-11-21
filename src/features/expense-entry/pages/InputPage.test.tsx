import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_VIEWPORT_WIDTH, stubViewportWidth } from "../../../test/viewport";
import { InputPage } from "./InputPage";

const useQueryMock = vi.fn();
const useInputPageWeekMock = vi.fn();
const retrySessionMock = vi.fn();
const weekNavigatorPropsMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../hooks/useInputPageWeek", () => ({
  useInputPageWeek: () => useInputPageWeekMock(),
}));

vi.mock("../../week", () => ({
  WEEK_SESSION_LOAD_ERROR_MESSAGE:
    "週次セッションの読み込みに失敗しました。もう一度お試しください。",
  WeekNavigator: (props: Record<string, unknown>) => {
    weekNavigatorPropsMock(props);
    return <div data-testid="week-navigator" />;
  },
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

const category = { _id: "cat1", name: "食費", color: "#2563eb" };

function renderInputPage() {
  return render(
    <MemoryRouter>
      <InputPage />
    </MemoryRouter>,
  );
}

describe("InputPage", () => {
  beforeEach(() => {
    stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
    useQueryMock.mockReset();
    useInputPageWeekMock.mockReset();
    retrySessionMock.mockReset();
    weekNavigatorPropsMock.mockReset();
    useInputPageWeekMock.mockReturnValue(defaultWeek);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("週集計の読み込み中は0件と表示しない", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce(undefined);

    renderInputPage();

    expect(screen.queryByTestId("week-status")).not.toBeInTheDocument();
  });

  it("週集計の件数・合計金額・表示週を週ステータスへ渡す", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce({
      count: 3,
      totalAmountYen: 12345,
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
    });

    renderInputPage();

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

    renderInputPage();

    expect(
      screen.getByText("週次セッションの読み込みに失敗しました。もう一度お試しください。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(retrySessionMock).toHaveBeenCalledOnce();
  });

  it("カテゴリ読込中はフォームの代わりにローディングを表示する", () => {
    useQueryMock.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

    renderInputPage();

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("expense-entry-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("week-navigator")).toBeInTheDocument();
  });

  it("カテゴリが0件と確定したら空状態を表示しフォーム（収入入力）も出す", () => {
    useQueryMock.mockReturnValueOnce([]).mockReturnValueOnce(undefined);

    renderInputPage();

    expect(screen.getByText(/カテゴリがまだ登録されていません/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "カテゴリ設定を開く" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByTestId("expense-entry-form")).toBeInTheDocument();
    expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
  });

  it("カテゴリが読み込めたらフォームを表示する", () => {
    useQueryMock.mockReturnValueOnce([category]).mockReturnValueOnce(undefined);

    renderInputPage();

    expect(screen.getByTestId("expense-entry-form")).toBeInTheDocument();
  });

  it("SPでは週ナビゲーターを1行に収まるコンパクト表示にする", () => {
    stubViewportWidth(390);
    useQueryMock.mockReturnValueOnce([category]).mockReturnValueOnce(undefined);

    renderInputPage();

    expect(weekNavigatorPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ compactOnMobile: true }),
    );
  });

  it("PCでは週ナビゲーターをコンパクトにしない", () => {
    stubViewportWidth(DEFAULT_TEST_VIEWPORT_WIDTH);
    useQueryMock.mockReturnValueOnce([category]).mockReturnValueOnce(undefined);

    renderInputPage();

    expect(weekNavigatorPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ compactOnMobile: false }),
    );
  });
});
