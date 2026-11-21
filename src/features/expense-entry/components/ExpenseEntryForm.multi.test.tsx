import "./ExpenseEntryFormTestMocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ExpenseEntryForm } from "./ExpenseEntryForm";
import { createExpenseEntriesMock, categories } from "./ExpenseEntryFormTestMocks";

describe("ExpenseEntryForm（multi）", () => {
  describe("複数支出項目モード", () => {
    it("「カテゴリ別の内訳を追加」ボタンで複数項目モードに切り替わる", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      expect(screen.getByText("入力元合計")).toBeInTheDocument();
      expect(screen.getByText("5,000")).toBeInTheDocument();
      expect(screen.getByLabelText("差額")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "項目を追加" })).toBeInTheDocument();
    });

    it("複数支出項目を入力して保存できる", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      // 入力元情報
      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      // 複数項目モード: 項目1（タイトルはhookがshopNameを引き継ぐので上書き）
      const item1 = screen.getByTestId("expense-item-0");
      await user.clear(within(item1).getByLabelText("内容"));
      await user.type(within(item1).getByLabelText("内容"), "食料品");
      await user.type(within(item1).getByLabelText("金額"), "3000");
      // デフォルト選択済みの場合 /食費/ でマッチ
      await user.click(within(item1).getByRole("option", { name: /食費/ }));

      // 項目追加
      await user.click(screen.getByRole("button", { name: "項目を追加" }));

      // 項目2
      const item2 = screen.getByTestId("expense-item-1");
      await user.type(within(item2).getByLabelText("内容"), "日用品");
      await user.type(within(item2).getByLabelText("金額"), "2000");
      await user.click(within(item2).getByRole("option", { name: /日用品/ }));

      // 差額0円を確認して保存
      expect(screen.getByLabelText("差額")).toBeInTheDocument();
      expect(screen.getByText("配分完了")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      await waitFor(() => {
        expect(createExpenseEntriesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ categoryId: "cat-food", amountYen: 3000, title: "食料品" }),
              expect.objectContaining({
                categoryId: "cat-daily",
                amountYen: 2000,
                title: "日用品",
              }),
            ]),
          }),
        );
      });
    });

    it("差額がマイナスの場合、保存ボタンが無効化される", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "3000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item1 = screen.getByTestId("expense-item-0");
      await user.clear(within(item1).getByLabelText("内容"));
      await user.type(within(item1).getByLabelText("内容"), "食料品");
      await user.type(within(item1).getByLabelText("金額"), "5000");
      await user.click(within(item1).getByRole("option", { name: /食費/ }));

      // 差額がマイナスのため保存ボタンが無効
      const saveButton = screen.getByRole("button", { name: "保存して次へ" });
      expect(saveButton).toBeDisabled();
      expect(screen.getByText(/超過/)).toBeInTheDocument();
    });

    it("差額がプラスの場合、確認ダイアログが表示される", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item1 = screen.getByTestId("expense-item-0");
      await user.clear(within(item1).getByLabelText("内容"));
      await user.type(within(item1).getByLabelText("内容"), "食料品");
      await user.type(within(item1).getByLabelText("金額"), "3000");
      await user.click(within(item1).getByRole("option", { name: /食費/ }));

      // 差額500円プラス → 確認ダイアログ
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      // ダイアログ内に「未配分」が少なくとも1件存在することを確認
      expect(within(dialog).getAllByText(/未配分/).length).toBeGreaterThan(0);
    });

    it("確認ダイアログで「このまま保存」を選ぶと保存される", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item1 = screen.getByTestId("expense-item-0");
      await user.clear(within(item1).getByLabelText("内容"));
      await user.type(within(item1).getByLabelText("内容"), "食料品");
      await user.type(within(item1).getByLabelText("金額"), "3000");
      await user.click(within(item1).getByRole("option", { name: /食費/ }));

      await user.click(screen.getByRole("button", { name: "保存して次へ" }));
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "このまま保存" }));

      await waitFor(() => {
        expect(createExpenseEntriesMock).toHaveBeenCalledTimes(1);
      });
    });

    it("項目を削除できる", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));
      await user.click(screen.getByRole("button", { name: "項目を追加" }));

      // 2項目存在する
      expect(screen.getByTestId("expense-item-0")).toBeInTheDocument();
      expect(screen.getByTestId("expense-item-1")).toBeInTheDocument();

      // 2項目目を削除
      await user.click(
        within(screen.getByTestId("expense-item-1")).getByRole("button", {
          name: "項目2を削除",
        }),
      );

      // 1項目だけ残る
      expect(screen.getByTestId("expense-item-0")).toBeInTheDocument();
      expect(screen.queryByTestId("expense-item-1")).not.toBeInTheDocument();
    });

    it("保存後に複数項目モードが解除されて通常モードに戻る", async () => {
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
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item1 = screen.getByTestId("expense-item-0");
      await user.clear(within(item1).getByLabelText("内容"));
      await user.type(within(item1).getByLabelText("内容"), "食料品");
      await user.type(within(item1).getByLabelText("金額"), "2000");
      await user.click(within(item1).getByRole("option", { name: /食費/ }));

      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      await waitFor(() => {
        // 複数項目モードが解除され、通常フォームに戻る
        expect(screen.queryByText("入力元合計")).not.toBeInTheDocument();
        expect(screen.getByLabelText("店舗名 / 支払先")).toHaveValue("");
      });
    });

    it("「内訳をやめる」で確認なしに単一モードへ戻り、金額に明細合計が入る", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item0 = screen.getByTestId("expense-item-0");
      await user.type(within(item0).getByLabelText("金額"), "3000");

      await user.click(screen.getByRole("button", { name: "内訳をやめる" }));

      // 店名・金額を引き継いで単一モードに戻り、金額は明細合計になる
      expect(screen.queryByTestId("expense-item-0")).not.toBeInTheDocument();
      expect(screen.getByLabelText("店舗名 / 支払先")).toHaveValue("スーパー北浜");
      expect(screen.getByLabelText("合計金額")).toHaveValue("3,000");

      // 戻ったあとは再編集できる
      await user.type(screen.getByLabelText("店舗名 / 支払先"), "ドラッグストア");
      expect(screen.getByLabelText("店舗名 / 支払先")).toHaveValue("スーパー北浜ドラッグストア");
    });

    it("入力済みの明細が2件以上あるときは確認ダイアログを出し、キャンセルで留まり確認で戻る", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item0 = screen.getByTestId("expense-item-0");
      await user.type(within(item0).getByLabelText("金額"), "3000");
      await user.click(screen.getByRole("button", { name: "項目を追加" }));
      const item1 = screen.getByTestId("expense-item-1");
      await user.type(within(item1).getByLabelText("金額"), "2000");

      await user.click(screen.getByRole("button", { name: "内訳をやめる" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("内訳をやめますか？")).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "単一項目の入力に戻ります。店舗名・日付・メモは引き継がれ、金額には明細の合計が入ります（明細の金額が未入力なら、今の金額のままです）。",
        ),
      ).toBeInTheDocument();

      // キャンセルすると複数項目モードに留まる
      await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("expense-item-1")).toBeInTheDocument();

      // もう一度開いて確認すると単一モードへ戻る
      await user.click(screen.getByRole("button", { name: "内訳をやめる" }));
      const confirmDialog = await screen.findByRole("dialog");
      await user.click(within(confirmDialog).getByRole("button", { name: "内訳をやめる" }));

      await waitFor(() => {
        expect(screen.queryByTestId("expense-item-0")).not.toBeInTheDocument();
        expect(screen.getByLabelText("合計金額")).toHaveValue("5,000");
      });
    });

    it("明細の金額が未入力のまま戻るときは、切り替え前の金額を保持する", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      // 金額は入力せず、内容だけ入れた明細を2件にする（確認ダイアログが出る条件）
      await user.click(screen.getByRole("button", { name: "項目を追加" }));
      const item1 = screen.getByTestId("expense-item-1");
      await user.type(within(item1).getByLabelText("内容"), "日用品");

      await user.click(screen.getByRole("button", { name: "内訳をやめる" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "内訳をやめる" }));

      // 明細合計が0円なので、切り替え前の合計金額が保持される
      await waitFor(() => {
        expect(screen.queryByTestId("expense-item-0")).not.toBeInTheDocument();
        expect(screen.getByLabelText("合計金額")).toHaveValue("5,000");
      });
    });

    it("単一モードで入力したメモが複数モードへの移行と復帰で引き継がれる", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.type(screen.getByLabelText("メモ"), "週末の買い物");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      await user.click(screen.getByRole("button", { name: "内訳をやめる" }));

      expect(screen.getByLabelText("メモ")).toHaveValue("週末の買い物");
    });

    it("先頭の明細を削除しても支出全体のメモが失われない", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.type(screen.getByLabelText("メモ"), "立替分");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      // 複数項目モードでも支出全体のメモ欄が見え、値が引き継がれている
      expect(screen.getByLabelText("メモ")).toHaveValue("立替分");

      // 2行目を追加してから1行目（メモを持つ行）を削除する
      await user.click(screen.getByRole("button", { name: "項目を追加" }));
      await user.click(screen.getByRole("button", { name: "項目1を削除" }));

      await user.click(screen.getByRole("button", { name: "内訳をやめる" }));

      expect(screen.getByLabelText("メモ")).toHaveValue("立替分");
    });

    it("500文字を超えるメモは複数項目モードでも理由が分かるエラーになる", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "3000");
      const longMemo = "あ".repeat(501);
      fireEvent.change(screen.getByLabelText("メモ"), { target: { value: longMemo } });
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      // 複数項目モードのメモ欄にも値が残る
      expect(screen.getByLabelText("メモ")).toHaveValue(longMemo);

      const item0 = screen.getByTestId("expense-item-0");
      await user.type(within(item0).getByLabelText("金額"), "3000");
      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      expect(await screen.findByText("メモは 500 文字以内です")).toBeInTheDocument();
      expect(createExpenseEntriesMock).not.toHaveBeenCalled();
    });

    it("保存中は内訳の操作ボタンが無効になる", async () => {
      createExpenseEntriesMock.mockReturnValueOnce(new Promise(() => {}));
      const user = userEvent.setup();
      renderWithProviders(
        <ExpenseEntryForm
          weekStartDate="2026-06-02"
          weekEndDate="2026-06-08"
          categories={categories}
        />,
      );

      await user.type(screen.getByLabelText("店舗名 / 支払先"), "スーパー北浜");
      await user.type(screen.getByLabelText("合計金額"), "5000");
      await user.click(screen.getByRole("button", { name: "カテゴリ別の内訳を追加" }));

      const item0 = screen.getByTestId("expense-item-0");
      await user.type(within(item0).getByLabelText("金額"), "3000");
      await user.click(screen.getByRole("button", { name: "項目を追加" }));
      const item1 = screen.getByTestId("expense-item-1");
      await user.type(within(item1).getByLabelText("内容"), "日用品");
      await user.type(within(item1).getByLabelText("金額"), "2000");

      await user.click(screen.getByRole("button", { name: "保存して次へ" }));

      // 送信が始まると保存ボタンがローディング（disabled）になる
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "保存して次へ" })).toBeDisabled();
      });
      expect(screen.getByRole("button", { name: "内訳をやめる" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "項目を追加" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "項目1を削除" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "項目2を削除" })).toBeDisabled();
    });
  });
});
