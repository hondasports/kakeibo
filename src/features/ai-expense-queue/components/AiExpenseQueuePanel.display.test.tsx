import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import "./AiExpenseQueuePanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { AiExpenseQueuePanel } from "./AiExpenseQueuePanel";
import { categories, queueItems } from "../../receipt-review/utils/testFixtures";
import { useQueryMock } from "./AiExpenseQueuePanelTestMocks";

describe("AiExpenseQueuePanel（表示）", () => {
  it("空状態では主導線と短い説明だけを表示する", () => {
    renderWithProviders(<AiExpenseQueuePanel />);

    expect(screen.getByRole("heading", { name: "レシート入力" })).toBeInTheDocument();
    expect(screen.queryByText("撮影して、あとでまとめて確認できます。")).not.toBeInTheDocument();
    expect(screen.getByText("まだ下書きはありません")).toBeInTheDocument();
    expect(
      screen.getByText("画像を解析して下書きを作成します。登録前に内容を確認できます。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("追加したレシートは状態別に表示されます。")).not.toBeInTheDocument();
    expect(screen.queryByText("レシート・払込票をまとめて追加できます。")).not.toBeInTheDocument();
    expect(
      screen.queryByText("スマートフォンでは撮影、PCでは画像選択から追加できます。"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "画像を読み取る" }).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByRole("button", { name: "カメラで撮影" })).toBeEnabled();
    expect(screen.getByLabelText("読み取り用カメラ画像を追加")).toHaveAttribute(
      "capture",
      "environment",
    );
    expect(screen.getByRole("button", { name: "詳しい説明" })).toBeInTheDocument();
  });

  it("初期アイテムでも保存済みwarningから失敗原因を表示する", () => {
    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[
          {
            id: "draft-timeout",
            fileName: "long-receipt.jpg",
            status: "failed",
            documentType: "receipt",
            warnings: ["[receipt_extraction:timeout] response body timeout"],
          },
        ]}
      />,
    );

    expect(screen.getByText(/画像の送信がタイムアウトしました/)).toBeInTheDocument();
  });

  it("画像送信の同意状態を読み込み中は画像追加導線を無効化する", () => {
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") return undefined;
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel />);

    expect(screen.getByRole("button", { name: "カメラで撮影" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "画像を読み取る" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByLabelText("読み取り用カメラ画像を追加")).toBeDisabled();
    expect(screen.getByLabelText("読み取り用画像を追加")).toBeDisabled();
  });

  it("状態ごとに簡潔なセクションと主操作を表示する", () => {
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} />);

    expect(screen.queryByText("読み取り中 0件")).not.toBeInTheDocument();
    expect(screen.getByText("登録できます 2件")).toBeInTheDocument();
    expect(screen.getByText("確認待ち 1件")).toBeInTheDocument();
    expect(screen.getByText("読み取り失敗 1件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認する（1件）" })).toBeEnabled();

    const readySection = screen.getByRole("region", { name: "登録できます" });
    expect(within(readySection).getByText("ok-receipt.png")).toBeInTheDocument();
    expect(within(readySection).getByText("2026/05/18 ・ 4,280円")).toBeInTheDocument();
    expect(within(readySection).getByText("registering-receipt.png")).toBeInTheDocument();
    expect(within(readySection).getByText("登録中")).toBeInTheDocument();
    expect(within(readySection).getByRole("button", { name: "登録する" })).toBeEnabled();
    expect(within(readySection).queryByRole("button", { name: "再解析" })).not.toBeInTheDocument();
    expect(within(readySection).queryByRole("button", { name: "再撮影" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "まとめて登録（1件）" })).toBeEnabled();
    expect(
      within(readySection).getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }),
    ).toBeChecked();

    const reviewSection = screen.getByRole("region", { name: "確認待ち" });
    expect(within(reviewSection).getByText("review-payment.png")).toBeInTheDocument();
    expect(within(reviewSection).getByText("必須項目不足")).toBeInTheDocument();
    expect(within(reviewSection).getByText("他1件")).toBeInTheDocument();
    expect(within(reviewSection).getByRole("button", { name: "確認する" })).toBeEnabled();
    expect(within(reviewSection).queryByRole("button", { name: "再解析" })).not.toBeInTheDocument();
    expect(within(reviewSection).queryByRole("button", { name: "再撮影" })).not.toBeInTheDocument();

    const failedSection = screen.getByRole("region", { name: "読み取り失敗" });
    expect(within(failedSection).getByText("failed-receipt.png")).toBeInTheDocument();
    expect(
      within(failedSection).getByRole("heading", { name: "読み取り失敗" }),
    ).toBeInTheDocument();
    expect(within(failedSection).getByRole("button", { name: "再撮影" })).toBeEnabled();
    expect(within(failedSection).getByRole("button", { name: "再解析" })).toBeDisabled();
    expect(
      within(failedSection).getByText(
        "明るい場所で、影や反射を避け、レシート全体を正面から撮影してください。",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByRole("region", { name: "読み取り中" })).not.toBeInTheDocument();

    const registeredSection = screen.getByRole("region", { name: "登録済み" });
    expect(within(registeredSection).getByText("registered-receipt.png")).toBeInTheDocument();
    expect(
      within(registeredSection).queryByRole("button", { name: "再解析" }),
    ).not.toBeInTheDocument();
    expect(
      within(registeredSection).queryByRole("button", { name: "再撮影" }),
    ).not.toBeInTheDocument();
  });

  it("セッション中の画像をサムネイルからプレビューできる", async () => {
    const user = userEvent.setup();
    const previewImageDataUrl = "data:image/jpeg;base64,preview-image";
    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[{ ...queueItems[0], previewImageDataUrl }]} />,
    );

    const thumbnailButton = screen.getByRole("button", {
      name: "ok-receipt.pngの画像をプレビュー",
    });
    await user.click(thumbnailButton);

    const dialog = screen.getByRole("dialog", { name: "ok-receipt.pngの画像プレビュー" });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "ok-receipt.pngのレシート画像" }),
    ).toHaveAttribute("src", previewImageDataUrl);

    await user.click(within(dialog).getByRole("button", { name: "プレビューを閉じる" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "ok-receipt.pngの画像プレビュー" }),
      ).not.toBeInTheDocument();
    });
    expect(thumbnailButton).toHaveFocus();

    await user.click(thumbnailButton);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "ok-receipt.pngの画像プレビュー" }),
      ).not.toBeInTheDocument();
    });
  });

  it("画像のデコードに失敗した場合は画像なし表示へフォールバックする", () => {
    const previewImageDataUrl = "data:image/jpeg;base64,broken-image";
    const { rerender } = renderWithProviders(
      <AiExpenseQueuePanel initialItems={[{ ...queueItems[0], previewImageDataUrl }]} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "ok-receipt.pngのレシート画像" }));

    expect(screen.getByText("このセッションでは画像を表示できません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok-receipt.pngの画像をプレビュー" })).toBeDisabled();

    rerender(
      <AiExpenseQueuePanel
        initialItems={[
          { ...queueItems[0], previewImageDataUrl: "data:image/jpeg;base64,new-image" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "ok-receipt.pngの画像をプレビュー" })).toBeEnabled();
  });

  it("画像がセッションにない場合はプレースホルダーを表示する", () => {
    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[0]]} />);

    expect(screen.getByText("このセッションでは画像を表示できません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok-receipt.pngの画像をプレビュー" })).toBeDisabled();
  });

  it("登録済みアイテムに日付とカテゴリが表示される", () => {
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} categories={categories} />);

    const registeredSection = screen.getByRole("region", { name: "登録済み" });
    expect(within(registeredSection).getByText("2026/05/20 ・ 1,800円")).toBeInTheDocument();
    expect(within(registeredSection).getByText("日用品")).toBeInTheDocument();
  });

  describe("Issue #337 レシート入力UI改善の表示・操作回帰", () => {
    it("詳しい説明は折りたたみ内にだけ補足テキストを表示する", async () => {
      const user = userEvent.setup();
      renderWithProviders(<AiExpenseQueuePanel />);

      const detailText = screen.getByText(
        "読み取り時は画像を外部APIへ送信します（初回は同意が必要です）。",
      );
      expect(detailText).not.toBeVisible();
      await user.click(screen.getByRole("button", { name: "詳しい説明" }));
      await waitFor(() => {
        expect(detailText).toBeVisible();
      });
    });

    it("解析中の下書きは登録導線を出さず状態だけ表示する", () => {
      renderWithProviders(
        <AiExpenseQueuePanel
          initialItems={[
            {
              id: "draft-analyzing",
              fileName: "processing.png",
              status: "analyzing",
              documentType: "receipt",
            },
          ]}
        />,
      );

      const processingSection = screen.getByRole("region", { name: "読み取り中" });
      expect(within(processingSection).getByText("processing.png")).toBeInTheDocument();
      expect(
        within(processingSection).queryByRole("button", { name: "登録する" }),
      ).not.toBeInTheDocument();
      expect(
        within(processingSection).queryByRole("button", { name: "確認する" }),
      ).not.toBeInTheDocument();
    });

    it("下書き詳細は簡潔な状態と修正導線を表示する", async () => {
      const user = userEvent.setup();
      useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
        if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
          return [];
        }
        return {
          draft: {
            _id: args.draftId,
            status: "needs_review",
            documentType: "receipt",
            shopName: "ドラッグストアA",
            date: "2026-06-21",
            amountYen: 1380,
            categoryId: "cat-daily",
            reviewReasons: ["ambiguous_category"],
            warnings: [],
          },
          items: [
            {
              _id: "item-food",
              itemName: "パン",
              amountYen: 150,
              categoryId: "cat-food",
              confidence: { itemName: 0.9, amountYen: 0.95, categoryId: 0.8 },
              warnings: [],
            },
          ],
        };
      });

      renderWithProviders(
        <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
      );

      await user.click(screen.getByRole("button", { name: "確認する" }));

      const dialog = screen.getByRole("dialog", { name: "下書き確認" });
      expect(within(dialog).queryByRole("heading", { name: "登録候補" })).not.toBeInTheDocument();
      expect(within(dialog).queryByText("食費 150円")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("region", { name: "商品一覧" })).toBeVisible();
      expect(within(dialog).getByRole("button", { name: "下書きを保存" })).toBeEnabled();
    });
  });
});
