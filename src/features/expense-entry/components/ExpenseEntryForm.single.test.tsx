import "./ExpenseEntryFormTestMocks";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ExpenseEntryForm } from "./ExpenseEntryForm";
import { createExpenseEntriesMock, categories } from "./ExpenseEntryFormTestMocks";

describe("ExpenseEntryForm（single）", () => {
  describe("単一支出項目モード（デフォルト）", () => {
    it("初期状態で単一モードのフォームが表示される", () => {
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );
      expect(screen.getByLabelText("店舗名 / 支払先")).toBeInTheDocument();
      expect(screen.getByLabelText("合計金額")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "保存して次へ" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" })).toBeInTheDocument();
    });

    it("店舗名・金額・カテゴリを入力して単一項目を保存できる", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "4280");
      // 食費はデフォルト選択済みのため "食費 選択中" として取得
      await user.click(screen.getByRole("option", { name: /食費/ }));
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      await waitFor(() => {
        expect(createExpenseEntriesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            date: "2026-06-02",
            items: [
              expect.objectContaining({
                categoryId: "cat-food",
                amountYen: 4280,
                title: "スーパー北浜",
              }),
            ],
          }),
        );
      });
    });

    it("店舗名が空の場合、保存せずエラーを表示する", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("合計金額"), "1000");
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      expect(createExpenseEntriesMock).not.toHaveBeenCalled();
      expect(await screen.findByText("店舗名 / 支払先は必須です")).toBeInTheDocument();
    });

    it("金額が空の場合、保存せずエラーを表示する", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      expect(createExpenseEntriesMock).not.toHaveBeenCalled();
      expect(await screen.findByText("金額は必須です")).toBeInTheDocument();
    });

    it("保存成功後、店舗名・金額をクリアして次の入力へ進める", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "2000");
      await user.click(screen.getByRole("option", { name: /食費/ }));
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      await waitFor(() => {
        expect(screen.getByLabelText("店舗名 / 支払先")).toHaveValue("");
        // 金額はクリア後に "" になる
        const amountInput = screen.getByLabelText("合計金額") as HTMLInputElement;
        expect(amountInput.value).toBe("");
      });
    });
  });
});
