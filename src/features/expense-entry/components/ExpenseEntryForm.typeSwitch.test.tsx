import "./ExpenseEntryFormTestMocks";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ExpenseEntryForm } from "./ExpenseEntryForm";
import { createIncomeEntryMock, categories } from "./ExpenseEntryFormTestMocks";

describe("ExpenseEntryForm（typeSwitch）", () => {
  describe("支出・収入切替", () => {
    it("収入では支出専用項目を隠してカテゴリなしで保存する", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.click(screen.getByRole("tab", { name: "収入" }));
      expect(screen.queryByLabelText("店舗名 / 支払先")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "レシートを追加" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "カテゴリ別の内訳を追加" }),
      ).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("金額"), "320000");
      await user.type(screen.getByLabelText("収入の内容・メモ"), "給与");
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      await waitFor(() =>
        expect(createIncomeEntryMock).toHaveBeenCalledWith({
          date: "2026-06-02",
          amountYen: 320000,
          title: "給与",
        }),
      );
    });

    it("収入金額のカンマ区切りを正しく保存する", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.click(screen.getByRole("tab", { name: "収入" }));
      await user.type(screen.getByLabelText("金額"), "320,000");
      await user.type(screen.getByLabelText("収入の内容・メモ"), "給与");
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      await waitFor(() =>
        expect(createIncomeEntryMock).toHaveBeenCalledWith({
          date: "2026-06-02",
          amountYen: 320000,
          title: "給与",
        }),
      );
      expect(await screen.findByText("収入を保存しました")).toBeInTheDocument();
    });

    it("種別を往復してもそれぞれの未保存入力を保持する", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.click(screen.getByRole("tab", { name: "収入" }));
      await user.type(screen.getByLabelText("収入の内容・メモ"), "賞与");
      await user.click(screen.getByRole("tab", { name: "支出" }));
      expect(screen.getByLabelText("店舗名 / 支払先")).toHaveValue("スーパー北浜");
      await user.click(screen.getByRole("tab", { name: "収入" }));
      expect(screen.getByLabelText("収入の内容・メモ")).toHaveValue("賞与");
    });

    it("収入保存が失敗しても入力値を保持する", async () => {
      createIncomeEntryMock.mockRejectedValueOnce(new Error("保存に失敗しました"));
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );
      await user.click(screen.getByRole("tab", { name: "収入" }));
      await user.type(screen.getByLabelText("金額"), "50000");
      await user.type(screen.getByLabelText("収入の内容・メモ"), "立替精算");
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      expect(await screen.findByText("保存に失敗しました")).toBeInTheDocument();
      expect(screen.getByLabelText("金額")).toHaveValue("50000");
      expect(screen.getByLabelText("収入の内容・メモ")).toHaveValue("立替精算");
    });
  });
});
