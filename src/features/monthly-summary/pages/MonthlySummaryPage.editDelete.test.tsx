import "./MonthlySummaryPageTestMocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { renderWithProviders } from "../../../test/render";
import { MonthlySummaryPage } from "./MonthlySummaryPage";
import { useQueryMock, useMutationMock } from "./MonthlySummaryPageTestMocks";

describe("MonthlySummaryPage（編集・削除）", () => {
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
