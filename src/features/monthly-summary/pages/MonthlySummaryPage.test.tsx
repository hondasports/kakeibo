import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithProviders } from "../../../test/render";
import { getCurrentWeekStartDate } from "../../week";
import { MonthlySummaryPage } from "./MonthlySummaryPage";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const navigateMock = vi.hoisted(() => vi.fn());
const routeMonth = vi.hoisted(() => ({ value: "2026-07" as string | undefined }));

vi.mock("../../../../lib/domain/common/month", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/domain/common/month")>();
  return { ...actual, getCurrentMonth: () => "2026-08" };
});

vi.mock("convex/react", () => ({
  useMutation: () => useMutationMock(),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({ "users.queries.getUserProfile": "get-user-profile" }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ month: routeMonth.value }),
  };
});

describe("MonthlySummaryPage", () => {
  beforeEach(() => {
    routeMonth.value = "2026-07";
    useMutationMock.mockReset();
    useMutationMock.mockImplementation(() => vi.fn());
    useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
      if (_query === "get-user-profile") {
        return { weeklyStartDay: 3 };
      }
      if (args && typeof args === "object" && "month" in args) {
        return {
          byCategory: [
            {
              categoryColor: "#8B5E3C",
              categoryId: "category-food",
              categoryName: "食費",
              count: 1,
              totalAmountYen: 1200,
            },
          ],
          count: 1,
          incomeCount: 1,
          incomes: [
            {
              _id: "income-1",
              amountYen: 50000,
              bankName: "給与口座",
              date: "2026-07-25",
              memo: undefined,
              recordType: "expenseEntry",
              type: "income",
            },
          ],
          netAmountYen: 48800,
          receipts: [
            {
              _id: "expense-1",
              amountYen: 1200,
              categoryColor: "#8B5E3C",
              categoryId: "category-food",
              categoryName: "食費",
              date: "2026-07-10",
              memo: undefined,
              recordType: "expenseEntry",
              shopName: "スーパー",
              type: "expense",
            },
          ],
          totalAmountYen: 1200,
          totalIncomeYen: 50000,
        };
      }
      return [{ _id: "category-food", name: "食費" }];
    });
    navigateMock.mockReset();
  });

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

  it("支出・収入の編集と削除をキャンセルできる", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /スーパー.*を編集$/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /給与口座.*を編集$/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /給与口座.*を削除$/ }));
    expect(screen.getByText("この記録を削除しますか？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => {
      expect(screen.queryByText("この記録を削除しますか？")).not.toBeInTheDocument();
    });
  }, 10_000);

  it("編集保存後に保存完了メッセージを表示する", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(() => updateMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /スーパー.*を編集$/ }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
      expect(screen.getByText("変更を保存しました。")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    });

    await user.click(within(screen.getByRole("status")).getByRole("button"));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("expenseEntriesの収入を編集保存できる", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(() => updateMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /給与口座.*を編集$/ }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        amountYen: 50000,
        date: "2026-07-25",
        expenseEntryId: "income-1",
        memo: undefined,
        title: "給与口座",
      });
    });
  });

  it("編集時に金額が不正なら保存せずエラーを表示する", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn();
    useMutationMock.mockImplementation(() => updateMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /スーパー.*を編集$/ }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("金額"));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(
      await within(dialog).findByText("金額は1円以上の整数で入力してください。"),
    ).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("編集時にタイトルが空なら保存せずエラーを表示する", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn();
    useMutationMock.mockImplementation(() => updateMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /スーパー.*を編集$/ }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("タイトル"));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByText("タイトルを入力してください。")).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("編集時に日付が空なら保存せずエラーを表示する", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn();
    useMutationMock.mockImplementation(() => updateMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /スーパー.*を編集$/ }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("日付"));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByText("日付を入力してください。")).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("旧レシートを入力内容を変更して編集保存できる", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(() => updateMock);
    useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
      if (args && typeof args === "object" && "month" in args) {
        return {
          byCategory: [],
          count: 1,
          incomeCount: 0,
          incomes: [],
          netAmountYen: -800,
          receipts: [
            {
              _id: "legacy-receipt-1",
              amountYen: 800,
              categoryColor: "#8B5E3C",
              categoryId: "category-food",
              categoryName: "食費",
              date: "2026-07-10",
              memo: "購入メモ",
              recordType: "receipt",
              shopName: "旧レシート",
              type: "expense",
            },
          ],
          totalAmountYen: 800,
          totalIncomeYen: 0,
        };
      }
      return [
        { _id: "category-food", name: "食費" },
        { _id: "category-daily", name: "日用品" },
      ];
    });

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /旧レシート.*を編集$/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("日付"), {
      target: { value: "2026-07-11" },
    });
    fireEvent.change(within(dialog).getByLabelText("金額"), { target: { value: "900" } });
    await user.click(within(dialog).getByRole("combobox", { name: "カテゴリ" }));
    await user.click(screen.getByRole("option", { name: "日用品" }));
    fireEvent.change(within(dialog).getByLabelText("タイトル"), {
      target: { value: "新しい店" },
    });
    fireEvent.change(within(dialog).getByLabelText("メモ"), { target: { value: "更新メモ" } });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        amountYen: 900,
        categoryId: "category-daily",
        date: "2026-07-11",
        memo: "更新メモ",
        receiptId: "legacy-receipt-1",
        shopName: "新しい店",
      });
    });
  });

  it("編集保存に失敗した場合はエラーを表示する", async () => {
    const user = userEvent.setup();
    const updateMock = vi.fn().mockRejectedValue(new Error("update failed"));
    useMutationMock.mockImplementation(() => updateMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /スーパー.*を編集$/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(
      await within(dialog).findByText("保存に失敗しました。入力内容を確認して再度お試しください。"),
    ).toBeInTheDocument();
  });

  it("expenseEntriesの削除成功後に完了メッセージを表示する", async () => {
    const user = userEvent.setup();
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(() => deleteMock);

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getAllByRole("button", { name: /を削除$/ })[0]);
    await user.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith({ expenseEntryId: "expense-1" });
      expect(screen.getByText("記録を削除しました。")).toBeInTheDocument();
    });
  });

  it("旧レシートの削除失敗時はエラーを表示する", async () => {
    const user = userEvent.setup();
    const deleteMock = vi.fn().mockRejectedValue(new Error("delete failed"));
    useMutationMock.mockImplementation(() => deleteMock);
    useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
      if (args && typeof args === "object" && "month" in args) {
        return {
          byCategory: [],
          count: 1,
          incomeCount: 0,
          incomes: [],
          netAmountYen: -800,
          receipts: [
            {
              _id: "legacy-receipt-1",
              amountYen: 800,
              categoryColor: "#8B5E3C",
              categoryId: "category-food",
              categoryName: "食費",
              date: "2026-07-10",
              memo: undefined,
              recordType: "receipt",
              shopName: "旧レシート",
              type: "expense",
            },
          ],
          totalAmountYen: 800,
          totalIncomeYen: 0,
        };
      }
      return null;
    });

    renderWithProviders(
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <MonthlySummaryPage />
        </LocalizationProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /旧レシート.*を削除$/ }));
    await user.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith({ receiptId: "legacy-receipt-1" });
      expect(
        screen.getByText("削除に失敗しました。時間をおいて再度お試しください。"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { hidden: true, name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByText("削除に失敗しました。時間をおいて再度お試しください."),
      ).not.toBeInTheDocument(),
    );
  });
});
