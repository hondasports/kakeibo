import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { SummaryPage } from "./SummaryPage";

const useQueryMock = vi.fn();
const mutationMock = vi.fn();
const useMutationMock = vi.fn(() => mutationMock);
const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ weekStartDate: "2026-06-15" }));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: () => useMutationMock(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

describe("SummaryPage", () => {
  const summaryResult = {
    count: 2,
    totalAmountYen: 300,
    totalIncomeYen: 0,
    incomeCount: 0,
    byCategory: [],
    prevWeekTotalAmountYen: null,
    receipts: [
      {
        _id: "expense-1",
        amountYen: 100,
        categoryColor: "#AAB7C4",
        categoryId: "cat-food",
        categoryName: "食費",
        date: "2026-06-15",
        recordType: "expenseEntry" as const,
        shopName: "スーパー北浜",
      },
      {
        _id: "receipt-1",
        amountYen: 200,
        categoryColor: "#AAB7C4",
        categoryId: "cat-food",
        categoryName: "食費",
        date: "2026-06-15",
        recordType: "receipt" as const,
        shopName: "コンビニ南",
      },
    ],
    incomes: [],
    weeks: [],
  };

  function renderSummaryPage() {
    renderWithProviders(
      <MemoryRouter initialEntries={["/weeks/2026-06-15"]}>
        <SummaryPage />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    useParamsMock.mockReturnValue({ weekStartDate: "2026-06-15" });
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue(summaryResult);
    useMutationMock.mockClear();
    mutationMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  it("振り返りとセッション完了のUIを表示しない", () => {
    renderSummaryPage();

    expect(screen.getByRole("navigation", { name: "履歴メニュー" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "週次振り返り" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "セッションを完了" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("振り返りメモ")).not.toBeInTheDocument();
  });

  it("表示中の週の履歴メニューから月次・年次サマリーへ進める", () => {
    renderSummaryPage();

    expect(screen.getByRole("link", { name: "月次サマリー" })).toHaveAttribute(
      "href",
      "/months/2026-06",
    );
    expect(screen.getByRole("link", { name: "2026年の年次サマリーを見る" })).toHaveAttribute(
      "href",
      "/years/2026",
    );
  });

  it("月またぎ週は週開始日の月へのリンクを表示する", () => {
    useParamsMock.mockReturnValue({ weekStartDate: "2026-04-27" });

    renderSummaryPage();

    expect(screen.getByRole("link", { name: "月次サマリー" })).toHaveAttribute(
      "href",
      "/months/2026-04",
    );
  });

  it("週開始曜日で正規化された週の月へのリンクを表示する", () => {
    useParamsMock.mockReturnValue({ weekStartDate: "2026-05-03" });
    useQueryMock
      .mockReset()
      .mockReturnValueOnce({ weeklyStartDay: 1 })
      .mockReturnValueOnce([])
      .mockReturnValueOnce(summaryResult)
      .mockReturnValueOnce({ weeks: [] });

    renderSummaryPage();

    expect(screen.getByRole("link", { name: "月次サマリー" })).toHaveAttribute(
      "href",
      "/months/2026-04",
    );
  });

  it("読み込み中はローディング状態を表示する", () => {
    useQueryMock.mockReset().mockReturnValue(undefined);

    renderSummaryPage();

    expect(screen.getByRole("navigation", { name: "履歴メニュー" })).toBeInTheDocument();
    expect(screen.getByText("週次サマリーを読み込んでいます…")).toBeInTheDocument();
  });

  it("週次サマリーの取得に失敗した場合はエラーを表示する", () => {
    let queryCall = 0;
    useQueryMock.mockReset().mockImplementation(() => {
      const index = queryCall % 4;
      queryCall += 1;
      if (index === 0) return { weeklyStartDay: 1 };
      if (index === 1) return [];
      if (index === 2) return null;
      return { weeks: [] };
    });

    renderSummaryPage();

    expect(screen.getByRole("navigation", { name: "履歴メニュー" })).toBeInTheDocument();
    expect(screen.getByText("週次サマリーの読み込みに失敗しました。")).toBeInTheDocument();
  });

  it("不正な週URLは現在週へ正規化して遷移する", () => {
    useParamsMock.mockReturnValue({ weekStartDate: "invalid" });

    renderSummaryPage();

    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/weeks\/\d{4}-\d{2}-\d{2}$/),
      {
        replace: true,
      },
    );
  });

  it("未来週URLは現在週へ正規化する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T03:00:00Z"));
    try {
      useParamsMock.mockReturnValue({ weekStartDate: "2999-01-04" });
      renderSummaryPage();
      expect(navigateMock).toHaveBeenCalledWith("/weeks/2026-06-15", { replace: true });
      expect(screen.getByRole("button", { name: "次の週へ" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("週ナビゲーションから前後の週へ遷移する", () => {
    renderSummaryPage();

    fireEvent.click(screen.getByRole("button", { name: "前の週へ" }));
    fireEvent.click(screen.getByRole("button", { name: "次の週へ" }));

    expect(navigateMock).toHaveBeenCalledWith("/weeks/2026-06-08");
    expect(navigateMock).toHaveBeenCalledWith("/weeks/2026-06-22");
  });

  it("削除対象がない状態で確定しても何もしない", async () => {
    renderSummaryPage();

    fireEvent.click(screen.getByRole("button", { name: /コンビニ南.*削除/ }));
    const deleteDialog = screen.getByRole("dialog");
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "キャンセル" }));
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "削除する" }));

    expect(mutationMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("収入の編集・削除操作を共通ハンドラへつなぐ", async () => {
    useQueryMock.mockReturnValue({
      ...summaryResult,
      incomeCount: 1,
      incomes: [
        {
          _id: "income-1",
          amountYen: 300000,
          bankName: "三井銀行",
          date: "2026-06-15",
          recordType: "expenseEntry" as const,
          type: "income" as const,
        },
      ],
    });

    renderSummaryPage();

    fireEvent.click(screen.getByRole("button", { name: /三井銀行.*編集/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mutationMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /三井銀行.*削除/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("編集保存とexpenseEntry・receiptの削除成功を処理する", async () => {
    renderSummaryPage();

    fireEvent.click(screen.getByRole("button", { name: /スーパー北浜.*編集/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /スーパー北浜.*編集/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mutationMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("変更を保存しました。")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /スーパー北浜.*削除/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(mutationMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("記録を削除しました。")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /コンビニ南.*削除/ }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(mutationMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /コンビニ南.*削除/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(mutationMock).toHaveBeenCalledTimes(3));
  });

  it("選択した明細のカテゴリ変更と一括削除を処理する", async () => {
    let queryCall = 0;
    useQueryMock.mockImplementation(() => {
      const index = queryCall % 4;
      queryCall += 1;
      if (index === 0) return { weeklyStartDay: 1 };
      if (index === 1) {
        return [
          { _id: "cat-food", name: "食費", color: "#f97316" },
          { _id: "cat-daily", name: "日用品", color: "#22c55e" },
        ];
      }
      if (index === 2) return summaryResult;
      return { weeks: [] };
    });
    mutationMock
      .mockResolvedValueOnce({ updatedCount: 2 })
      .mockResolvedValueOnce({ deletedCount: 2 });

    renderSummaryPage();

    fireEvent.click(screen.getByRole("checkbox", { name: /スーパー北浜.*を選択/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /コンビニ南.*を選択/ }));
    expect(screen.getByText("明細2件を選択中")).toBeInTheDocument();

    const user = userEvent.setup();
    fireEvent.click(screen.getByRole("button", { name: "カテゴリを変更" }));
    await user.click(screen.getByLabelText("変更後のカテゴリ"));
    await user.click(screen.getByRole("option", { name: "日用品" }));
    await user.click(screen.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(mutationMock).toHaveBeenCalled());
    expect(await screen.findByText("明細2件のカテゴリを変更しました。")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("checkbox", { name: /スーパー北浜.*を選択/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /コンビニ南.*を選択/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(screen.getByRole("heading", { name: "明細2件を削除しますか？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    expect(await screen.findByText("明細2件を削除しました。")).toBeInTheDocument();
  });

  it("削除に失敗した場合はエラーを表示する", async () => {
    mutationMock.mockRejectedValueOnce(new Error("delete failed"));

    renderSummaryPage();

    fireEvent.click(screen.getByRole("button", { name: /コンビニ南.*削除/ }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() =>
      expect(
        screen.getByText("削除に失敗しました。時間をおいて再度お試しください。"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const errorAlert = screen.getByRole("alert");
    const closeButton = errorAlert.querySelector("button");
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton as HTMLButtonElement);
    expect(
      screen.queryByText("削除に失敗しました。時間をおいて再度お試しください。"),
    ).not.toBeInTheDocument();
  });
});
