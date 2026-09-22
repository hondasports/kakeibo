import "./MonthlySummaryPageTestMocks";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { renderWithProviders } from "../../../test/render";
import { getCurrentWeekStartDate } from "../../week";
import { MonthlySummaryPage } from "./MonthlySummaryPage";
import { useQueryMock, navigateMock, routeMonth } from "./MonthlySummaryPageTestMocks";

describe("MonthlySummaryPage（表示・遷移）", () => {
  it("月次の収支、カテゴリ、支出・収入一覧を表示する", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/months/2026-07"]}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "月次サマリー" })).toBeInTheDocument();
    const historyNavigation = screen.getByRole("navigation", { name: "履歴メニュー" });
    expect(within(historyNavigation).getByRole("link", { name: "月次サマリー" })).toHaveAttribute(
      "href",
      "/months/2026-07",
    );
    expect(within(historyNavigation).getByRole("link", { name: "月次サマリー" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(historyNavigation).getByRole("link", { name: "週次サマリー" })).toHaveAttribute(
      "href",
      `/weeks/${getCurrentWeekStartDate(3)}`,
    );
    expect(screen.getByLabelText("支出")).toHaveTextContent("1,200円");
    expect(screen.getByLabelText("収入")).toHaveTextContent("50,000円");
    expect(screen.getByLabelText("差引")).toHaveTextContent("+48,800円");
    expect(screen.getByRole("heading", { name: "支出カテゴリ" })).toBeInTheDocument();
    expect(screen.getByLabelText("月次サマリーの支出一覧")).toBeInTheDocument();
    expect(screen.getByLabelText("月次サマリーの収入一覧")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2026年の年次サマリーを見る" })).toHaveAttribute(
      "href",
      "/years/2026",
    );
  });
  it("データがない月は支出・収入の空状態を表示する", () => {
    useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
      if (args && typeof args === "object" && "month" in args) {
        return {
          byCategory: [],
          count: 0,
          incomeCount: 0,
          incomes: [],
          netAmountYen: 0,
          receipts: [],
          totalAmountYen: 0,
          totalIncomeYen: 0,
        };
      }
      return [];
    });

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "履歴メニュー" })).toBeInTheDocument();
    expect(screen.getAllByText("この月の支出はまだありません").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("この月の収入はまだありません")).toBeInTheDocument();
  });
  it("月次データの読み込み中は画面枠とカードのローディングを表示する", () => {
    useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
      if (args && typeof args === "object" && "month" in args) {
        return undefined;
      }
      return [];
    });

    const { container } = renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "月次サマリー" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="monthly-metric-skeleton"]')).toHaveLength(3);
  });
  it("不正な月URLは当月へ置き換える", async () => {
    routeMonth.value = "2026-13";

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(`/months/${getCurrentMonth()}`, { replace: true });
    });
  });
  it("前月・次月・今月の操作で安全な月へ遷移する", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "前月へ" }));
    await user.click(screen.getByRole("button", { name: "次月へ" }));
    await user.click(screen.getByRole("button", { name: "今月へ" }));

    expect(navigateMock).toHaveBeenNthCalledWith(1, "/months/2026-06");
    expect(navigateMock).toHaveBeenNthCalledWith(2, "/months/2026-08");
    expect(navigateMock).toHaveBeenNthCalledWith(3, "/months/2026-08");
  });
  it("カレンダーの日付選択で日別一覧へ遷移する", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /2026年7月10日/ }));

    expect(navigateMock).toHaveBeenCalledWith("/months/2026-07?date=2026-07-10");
  });
  it("日付クエリがある場合はその日の支出・収入一覧へ絞り込む", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MemoryRouter initialEntries={["/months/2026-07?date=2026-07-10"]}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "2026年7月10日の明細" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月全体を見る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2026年7月10日/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const expenseList = screen.getByLabelText("2026年7月10日の支出一覧");
    expect(within(expenseList).getByText("スーパー")).toBeInTheDocument();
    expect(screen.getByText("この日の収入はまだありません")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "月全体を見る" }));
    expect(navigateMock).toHaveBeenCalledWith("/months/2026-07");
  });
  it("月外や不正な日付クエリは月全体へ戻す", async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/months/2026-07?date=2026-02-31"]}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/months/2026-07", { replace: true });
    });
  });
});
