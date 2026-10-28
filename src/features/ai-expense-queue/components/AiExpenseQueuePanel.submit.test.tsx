import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "./AiExpenseQueuePanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { AiExpenseQueuePanel } from "./AiExpenseQueuePanel";
import { categories, queueItems } from "../../receipt-review/utils/testFixtures";
import type {
  AiExpenseDraft,
  AiExpenseDraftItem,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import type { AiExpenseQueueItem } from "../../../types/aiExpenseQueue";
import {
  registerReadyDraftsAsExpenseEntriesMock,
  updateForReviewMock,
  useQueryMock,
} from "./AiExpenseQueuePanelTestMocks";

/**
 * /__e2e__/ai-expense-queue と同じく、保存結果をサーバー永続化ではなく
 * ブラウザ内の useState へ反映するハーネス。キューの再表示だけを検証する。
 */
function LocalQueueHarness({
  items: initialQueueItems,
  drafts,
  draftItems = {},
}: {
  items: AiExpenseQueueItem[];
  drafts: Record<string, AiExpenseDraft>;
  draftItems?: Record<string, AiExpenseDraftItem[]>;
}) {
  const [items, setItems] = useState(initialQueueItems);
  return (
    <AiExpenseQueuePanel
      categories={categories}
      initialItems={items}
      initialReviewDrafts={drafts}
      initialReviewDraftItems={draftItems}
      onReviewSubmit={(draftId, values, registerAfterUpdate) => {
        setItems((current) =>
          current.map((item) =>
            item.id === draftId
              ? {
                  ...item,
                  status: registerAfterUpdate ? "registered" : "ready",
                  documentType: values.documentType,
                  title: values.shopName,
                  amountYen: values.amountYen,
                  registrationMode: values.registrationMode,
                  reviewReasons: [],
                }
              : item,
          ),
        );
        return {
          status: registerAfterUpdate ? "registered" : "ready",
          reviewReasons: [],
        };
      }}
    />
  );
}

describe("AiExpenseQueuePanel（レビュー送信・一括登録）", () => {
  it("選択した ready 下書きだけまとめて登録する", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} />);

    await user.click(screen.getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "まとめて登録（0件）" })).toBeDisabled();
    });

    await user.click(screen.getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }));
    await user.click(screen.getByRole("button", { name: "まとめて登録（1件）" }));
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(registerReadyDraftsAsExpenseEntriesMock).toHaveBeenCalledWith({
      draftIds: ["draft-ready"],
    });
  });

  it("確認が必要な下書きを編集して登録準備OKへ戻す", async () => {
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
          shopName: "",
          paymentPlace: "",
          payeeName: "スーパー青葉",
          paymentPurpose: "",
          date: "2026-06-01",
          amountYen: 9120,
          categoryId: "cat-daily",
          reviewReasons: ["low_confidence", "missing_required_field"],
          warnings: ["店名が読み取れませんでした"],
        },
        items: [],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    expect(screen.getByRole("heading", { name: "下書き確認" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(
      within(within(dialog).getByRole("region", { name: "全体の確認状態" })).getByText(
        /レシート全体の読み取り確認です/,
      ),
    ).toBeVisible();

    expect(within(dialog).queryByLabelText("支払場所")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("支払先")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("支払内容")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("店名・内容"));
    await user.type(screen.getByLabelText("店名・内容"), "スーパー青葉");
    await user.clear(screen.getByLabelText("合計金額"));
    await user.type(screen.getByLabelText("合計金額"), "1680");
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith({
      draftId: "draft-review",
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1680,
      categoryId: "cat-daily",
      registrationMode: "detailed",
      items: [],
    });
    expect(registerReadyDraftsAsExpenseEntriesMock).not.toHaveBeenCalled();
  });

  it("税情報が不明で保存された下書きは合計だけ保存モードを維持する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") return [];
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "スーパー青葉",
          date: "2026-06-01",
          amountYen: 1680,
          categoryId: "cat-daily",
          reviewReasons: ["amount_mismatch"],
          receiptUserOverride: {
            source: "user",
            updatedAt: 1,
            fields: ["receiptTaxDecision"],
            values: {},
          },
          receiptTaxDecision: {
            priceTaxTreatment: "unknown",
            taxRateComposition: "unknown",
            resolutionStatus: "ambiguous",
            resolutionSource: "user",
            evidence: [],
            reasons: [],
            candidates: [],
            taxAmount: { roundingMethod: "unknown" },
          },
        },
        items: [{ itemName: "OCR商品", amountYen: 1200, categoryId: undefined, confidence: {} }],
      };
    });
    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/履歴・予算・カテゴリ集計には使われません/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "レシート合計だけ保存" }));
    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountYen: 1680, registrationMode: "totalOnly" }),
    );
  });

  it("確認下書きの詳細読み込み前はフォーム送信できない", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference === "aiExpenseDrafts.queries.getWithItems" && args !== "skip") {
        return undefined;
      }
      return [];
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("下書きを読み込んでいます。")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: /この内容で保存|下書きを保存|修正が必要な項目へ/,
      }),
    ).toBeDisabled();
    expect(within(dialog).queryByLabelText("合計金額")).not.toBeInTheDocument();
  });

  it("確認下書きが見つからない場合はローディングを続けずエラーを表示する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference === "aiExpenseDrafts.queries.getWithItems" && args !== "skip") {
        return null;
      }
      return [];
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("下書きを読み込んでいます。")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("下書きが見つかりません。一覧を更新してもう一度確認してください。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: /この内容で保存|下書きを保存|修正が必要な項目へ/,
      }),
    ).toBeDisabled();
  });

  it("未判定の書類種別は選択肢に表示せず送信前に止める", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "unknown",
            shopName: "スーパー青葉",
            date: "2026-06-01",
            amountYen: 9120,
            categoryId: "cat-daily",
            reviewReasons: ["ambiguous_document_type"],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "修正が必要な項目へ" }));
    expect(within(dialog).getByRole("combobox", { name: "書類種別" })).toHaveFocus();

    await user.click(within(dialog).getByRole("combobox", { name: "書類種別" }));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByRole("option", { name: "種別未判定" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));

    expect(within(dialog).getByText("書類種別を選択してください。")).toBeInTheDocument();
    expect(updateForReviewMock).not.toHaveBeenCalled();
  });

  it("確認が必要な下書きを登録準備OKへ戻す送信分岐を呼べる", async () => {
    const user = userEvent.setup();
    const onReviewSubmit = vi.fn().mockResolvedValue({ status: "ready", reviewReasons: [] });

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "convenience_payment",
            shopName: "コンビニ北浜",
            paymentPlace: "コンビニ北浜",
            payeeName: "大阪市水道局",
            paymentPurpose: "",
            date: "2026-06-01",
            amountYen: 9120,
            categoryId: "cat-daily",
            reviewReasons: ["missing_required_field"],
          },
        }}
        onReviewSubmit={onReviewSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const nameInput = screen.getByLabelText("店名・内容");
    expect(nameInput).toHaveValue("大阪市水道局");
    await user.clear(nameInput);
    await user.type(nameInput, "大阪市水道局 水道料金");
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    expect(onReviewSubmit).toHaveBeenCalledWith(
      "draft-review",
      expect.objectContaining({
        documentType: "convenience_payment",
        shopName: "大阪市水道局 水道料金",
        amountYen: 9120,
        categoryId: "cat-daily",
      }),
      false,
    );
    expect(registerReadyDraftsAsExpenseEntriesMock).not.toHaveBeenCalled();
  });

  it("保存結果がreadyならダイアログを閉じて登録可能のSnackbarを表示する", async () => {
    const user = userEvent.setup();
    updateForReviewMock.mockResolvedValueOnce({
      status: "ready",
      reviewReasons: [],
    });

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "receipt",
            shopName: "スーパー青葉",
            date: "2026-06-01",
            amountYen: 1680,
            categoryId: "cat-food",
            reviewReasons: ["low_confidence"],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/保存しました。登録できます。/)).toBeInTheDocument();
    expect(screen.getByText(/スーパー青葉・1,680円・食費/)).toBeInTheDocument();
  });

  it("保存に失敗した場合はダイアログと入力値を保持する", async () => {
    const user = userEvent.setup();
    updateForReviewMock.mockRejectedValueOnce(new Error("保存に失敗しました"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      renderWithProviders(
        <AiExpenseQueuePanel
          initialItems={[queueItems[1]]}
          categories={categories}
          initialReviewDrafts={{
            "draft-review": {
              _id: "draft-review",
              status: "needs_review",
              documentType: "receipt",
              shopName: "スーパー青葉",
              date: "2026-06-01",
              amountYen: 1680,
              categoryId: "cat-food",
              reviewReasons: ["amount_mismatch"],
            },
          }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "確認する" }));
      const nameInput = screen.getByLabelText("店名・内容");
      const amountInput = screen.getByLabelText("合計金額");
      await user.clear(nameInput);
      await user.type(nameInput, "保存前の入力");
      await user.clear(amountInput);
      await user.type(amountInput, "7803");
      await user.click(screen.getByRole("button", { name: "下書きを保存" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(nameInput).toHaveValue("保存前の入力");
      expect(amountInput).toHaveValue("7803");
      expect(
        screen
          .getAllByRole("alert")
          .some((alert) => alert.textContent?.includes("保存に失敗しました")),
      ).toBe(true);
      await user.click(screen.getByRole("button", { name: "下書きを保存" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(updateForReviewMock).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("保存結果がneeds_reviewでもダイアログを閉じて確認待ちを通知する", async () => {
    const user = userEvent.setup();
    updateForReviewMock.mockResolvedValueOnce({
      status: "needs_review",
      reviewReasons: ["amount_mismatch"],
    });

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "receipt",
            shopName: "スーパー青葉",
            date: "2026-06-01",
            amountYen: 1680,
            categoryId: "cat-food",
            reviewReasons: ["amount_mismatch"],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/保存しました。確認待ちに残っています。/)).toBeInTheDocument();
    expect(screen.getByText(/確認ポイント：金額・税内訳の確認が必要/)).toBeInTheDocument();
  });

  it("確認待ちの下書きを保存すると登録できますへ更新内容が並び、再編集も同じ導線でできる", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocalQueueHarness
        items={[queueItems[1]]}
        drafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "convenience_payment",
            shopName: "",
            paymentPlace: "セブンイレブン北浜店",
            payeeName: "大阪市水道局",
            paymentPurpose: "",
            date: "2026-06-01",
            amountYen: 9120,
            categoryId: "cat-daily",
            reviewReasons: ["low_confidence", "missing_required_field"],
            warnings: [],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog", { name: "下書き確認" });
    expect(within(dialog).getByLabelText("店名・内容")).toHaveValue("大阪市水道局");
    expect(within(dialog).getByLabelText("合計金額")).toHaveValue("9120");
    expect(within(dialog).getByLabelText("支出日（レシート記載日）")).toHaveValue("2026-06-01");

    await user.clear(within(dialog).getByLabelText("店名・内容"));
    await user.type(within(dialog).getByLabelText("店名・内容"), "大阪市水道局 水道料金");
    await user.clear(within(dialog).getByLabelText("合計金額"));
    await user.type(within(dialog).getByLabelText("合計金額"), "9160");
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 15_000 },
    );
    const readySection = screen.getByRole("region", { name: "登録できます" });
    const readyItem = readySection
      .querySelectorAll(".ai-expense-queue-item")
      .item(0) as HTMLElement;
    expect(within(readyItem).getByText("大阪市水道局 水道料金")).toBeVisible();
    expect(within(readyItem).getByText(/9,160円/)).toBeVisible();
    expect(screen.queryByRole("region", { name: "確認待ち" })).not.toBeInTheDocument();

    await user.click(within(readyItem).getByRole("button", { name: "修正する" }));
    const reopened = screen.getByRole("dialog", { name: "下書き確認" });
    await user.clear(within(reopened).getByLabelText("店名・内容"));
    await user.type(within(reopened).getByLabelText("店名・内容"), "大阪市水道局 6月分");
    await user.clear(within(reopened).getByLabelText("合計金額"));
    await user.type(within(reopened).getByLabelText("合計金額"), "9200");
    await user.click(within(reopened).getByRole("button", { name: "下書きを保存" }));

    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 15_000 },
    );
    const reeditedItem = screen
      .getByRole("region", { name: "登録できます" })
      .querySelectorAll(".ai-expense-queue-item")
      .item(0) as HTMLElement;
    expect(within(reeditedItem).getByText("大阪市水道局 6月分")).toBeVisible();
    expect(within(reeditedItem).getByText(/9,200円/)).toBeVisible();
    expect(within(reeditedItem).getByRole("button", { name: "修正する" })).toBeVisible();
    expect(within(reeditedItem).getByRole("button", { name: "登録する" })).toBeVisible();
  }, 20_000);

  it("税率未確定の下書きは確認事項を残したまま保存して登録できますへ並ぶ", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LocalQueueHarness
        items={[queueItems[1]]}
        drafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "convenience_payment",
            shopName: "",
            paymentPlace: "セブンイレブン北浜店",
            payeeName: "大阪市水道局",
            paymentPurpose: "",
            date: "2026-06-01",
            amountYen: 9120,
            categoryId: "cat-daily",
            reviewReasons: ["low_confidence", "missing_required_field"],
            warnings: [],
            rawObservation: {
              source: "ai_ocr",
              observedAt: 1,
              lines: [
                {
                  rawText: "大阪市水道局 水道料金",
                  amountText: "9,120円",
                  amountYen: 9120,
                  lineRoleCandidates: ["total"],
                  roleConfidence: 0.88,
                  explicitlyPrinted: true,
                  sourceLineIndex: 0,
                },
              ],
            },
          },
        }}
        draftItems={{
          "draft-review": [
            {
              _id: "item-food",
              itemName: "パン",
              amountYen: 120,
              categoryId: "cat-food",
              confidence: { itemName: 0.92, amountYen: 0.95, categoryId: 0.86 },
              warnings: [],
            },
            {
              _id: "item-medical",
              itemName: "胃薬",
              amountYen: 980,
              confidence: { itemName: 0.72, amountYen: 0.95, categoryName: 0.4 },
              warnings: ["品名が不鮮明です"],
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog", { name: "下書き確認" });
    expect(
      within(within(dialog).getByRole("region", { name: "確認結果" })).getByText(
        /「.+」など税設定の確認が必要な明細があります/,
      ),
    ).toBeVisible();

    await user.clear(within(dialog).getByLabelText("店名・内容"));
    await user.type(within(dialog).getByLabelText("店名・内容"), "大阪市水道局 水道料金");
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 15_000 },
    );
    expect(
      within(screen.getByRole("region", { name: "登録できます" })).getByText(
        "大阪市水道局 水道料金",
      ),
    ).toBeVisible();
  }, 20_000);

  it("合計だけ保存の下書きは保存・再編集後も合計だけで保存を維持する", async () => {
    const user = userEvent.setup();
    const totalOnlyQueueItem: AiExpenseQueueItem = {
      id: "draft-totalonly",
      fileName: "review-totalonly.png",
      status: "needs_review",
      documentType: "receipt",
      title: "E2E合計のみ店",
      amountYen: 108,
      date: "2026-07-04",
      categoryName: "食費",
      registrationMode: "totalOnly",
      reviewReasons: ["user_confirmation_required"],
    };
    renderWithProviders(
      <LocalQueueHarness
        items={[totalOnlyQueueItem]}
        drafts={{
          "draft-totalonly": {
            _id: "draft-totalonly",
            status: "needs_review",
            documentType: "receipt",
            shopName: "E2E合計のみ店",
            date: "2026-07-04",
            amountYen: 108,
            categoryId: "cat-food",
            registrationMode: "totalOnly",
            reviewReasons: ["user_confirmation_required"],
            warnings: [],
            rawObservation: {
              source: "ai_ocr",
              observedAt: 1,
              lines: [
                {
                  rawText: "E2E合計のみ商品 108円",
                  amountText: "108円",
                  amountYen: 108,
                  lineRoleCandidates: ["item"],
                  roleConfidence: 0.95,
                  explicitlyPrinted: true,
                  sourceLineIndex: 0,
                },
              ],
            },
          },
        }}
        draftItems={{
          "draft-totalonly": [
            {
              _id: "item-totalonly",
              itemName: "E2E合計のみ商品",
              amountYen: 108,
              printedAmountYen: 108,
              categoryId: "cat-food",
              confidence: { itemName: 0.95, amountYen: 0.95, categoryId: 0.95 },
              warnings: [],
              taxResolutionStatus: "unresolved",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog", { name: "下書き確認" });
    expect(within(dialog).getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await user.clear(within(dialog).getByLabelText("合計金額"));
    await user.type(within(dialog).getByLabelText("合計金額"), "5000");
    await user.click(within(dialog).getByRole("button", { name: "レシート合計だけ保存" }));

    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 15_000 },
    );
    const readySection = screen.getByRole("region", { name: "登録できます" });
    const readyItem = readySection
      .querySelectorAll(".ai-expense-queue-item")
      .item(0) as HTMLElement;
    expect(within(readyItem).getByText("E2E合計のみ店")).toBeVisible();
    expect(within(readyItem).getByText(/5,000円/)).toBeVisible();
    expect(within(readyItem).getByText("合計だけで保存")).toBeVisible();
    expect(within(readyItem).getByRole("button", { name: "登録する" })).toBeEnabled();

    await user.click(within(readyItem).getByRole("button", { name: "修正する" }));
    const reopened = screen.getByRole("dialog", { name: "下書き確認" });
    expect(within(reopened).getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await user.click(within(reopened).getByRole("button", { name: "レシート合計だけ保存" }));

    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      { timeout: 15_000 },
    );
    const reeditedItem = screen
      .getByRole("region", { name: "登録できます" })
      .querySelectorAll(".ai-expense-queue-item")
      .item(0) as HTMLElement;
    expect(within(reeditedItem).getByText("合計だけで保存")).toBeVisible();
    expect(within(reeditedItem).getByRole("button", { name: "登録する" })).toBeEnabled();
  }, 20_000);
});
