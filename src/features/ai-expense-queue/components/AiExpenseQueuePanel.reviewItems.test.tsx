import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import "./AiExpenseQueuePanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { AiExpenseQueuePanel } from "./AiExpenseQueuePanel";
import { categories, queueItems } from "../../receipt-review/utils/testFixtures";
import {
  registerReadyDraftsAsExpenseEntriesMock,
  updateForReviewMock,
  resetReceiptToAiInterpretationMock,
  useQueryMock,
} from "./AiExpenseQueuePanelTestMocks";

describe("AiExpenseQueuePanel（明細編集）", () => {
  it("保存方法の選択UIは表示せず、明細モードのまま保存する", async () => {
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
        },
        items: [{ itemName: "OCR商品", amountYen: 1200, categoryId: "cat-daily", confidence: {} }],
      };
    });
    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("radio", { name: "レシート合計だけ保存" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "明細ごとに保存" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountYen: 1680, registrationMode: "detailed" }),
    );
  });

  it("OCR原文を確認し、ユーザー補正を明示操作でAI判定へ戻せる", async () => {
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
          shopName: "ユーザー補正店舗",
          date: "2026-06-01",
          amountYen: 803,
          categoryId: "cat-daily",
          reviewReasons: [],
          rawObservation: {
            source: "ai_ocr",
            observedAt: 1,
            lines: [
              {
                rawText: "合計 ￥８０３",
                amountText: "￥８０３",
                amountYen: 803,
                lineRoleCandidates: ["total"],
                roleConfidence: 0.98,
                explicitlyPrinted: true,
                sourceLineIndex: 0,
              },
            ],
          },
          receiptInterpretation: { source: "ai", interpretedAt: 1, values: {} },
          receiptUserOverride: {
            source: "user",
            updatedAt: 2,
            fields: ["amountYen"],
            values: {},
          },
        },
        items: [],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );
    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog", { name: "下書き確認" });
    await user.click(within(dialog).getByText("読み取り原文・詳しい税情報（参考）"));
    expect(within(dialog).getByRole("list", { name: "OCR原文" })).toHaveTextContent(
      "合計 ￥８０３",
    );
    await user.click(within(dialog).getByRole("button", { name: "AI判定へ戻す" }));

    expect(resetReceiptToAiInterpretationMock).toHaveBeenCalledWith({ draftId: "draft-review" });
  });

  it("明細あり下書きは状態を簡潔に表示し、明細は折りたたみで確認できる", async () => {
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
          reviewReasons: ["ambiguous_category", "amount_mismatch"],
          warnings: [],
          rawObservation: {
            source: "ai_ocr",
            observedAt: 1,
            lines: [
              {
                rawText: "読取不能 250円",
                amountText: "250円",
                amountYen: 250,
                lineRoleCandidates: ["item", "unknown"],
                roleConfidence: 0.4,
                explicitlyPrinted: true,
                sourceLineIndex: 4,
              },
            ],
          },
          receiptInterpretation: {
            source: "ai",
            interpretedAt: 1,
            values: {
              receiptLineClassifications: [
                {
                  sourceLineIndex: 4,
                  status: "ambiguous",
                  candidates: [
                    { role: "item", score: 0.51, evidence: ["ai_candidate:item"] },
                    { role: "unknown", score: 0.4, evidence: ["classification_ambiguous"] },
                  ],
                },
              ],
            },
          },
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
          {
            _id: "item-medical",
            itemName: "胃薬",
            amountYen: 980,
            confidence: { itemName: 0.85, amountYen: 0.95, categoryName: 0.5 },
            warnings: ["品名が不鮮明です"],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("店名・内容")).toHaveValue("ドラッグストアA");
    expect(within(dialog).getByLabelText("支出日（レシート記載日）")).toHaveValue("2026-06-21");
    expect(within(dialog).getByLabelText("合計金額")).toHaveValue("1380");
    expect(within(dialog).queryByText(/判定が曖昧なOCR行/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "全体の確認状態" })).toHaveTextContent(
      "差額 250円",
    );
    const itemInput = within(dialog).getByDisplayValue("パン");
    const detail = itemInput.closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    await user.click(detail.querySelector("summary")!);
    expect(detail).toHaveAttribute("open");
    expect(itemInput).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "下書きを保存" })).toBeEnabled();
  });

  it("複数カテゴリを同じ画面で確認して下書き保存する", async () => {
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
          reviewReasons: ["multiple_categories"],
          warnings: ["unknown_amount_basis:items[0]", "unknown_amount_basis:items[1]"],
        },
        items: [
          { _id: "item-food", itemName: "パン", amountYen: 400, categoryId: "cat-food" },
          { _id: "item-daily", itemName: "洗剤", amountYen: 980, categoryId: "cat-daily" },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("region", { name: "商品一覧" })).toBeVisible();
    expect(within(dialog).getByRole("region", { name: "確認結果" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/unknown_amount_basis/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "下書きを保存" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "修正して登録" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "登録準備OKに戻す" }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateForReviewMock).toHaveBeenCalled();
    expect(registerReadyDraftsAsExpenseEntriesMock).not.toHaveBeenCalled();
  });

  it("確認が必要な下書きの明細を表示し、編集・追加・削除して保存できる", async () => {
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
          reviewReasons: ["ambiguous_category", "amount_mismatch"],
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
          {
            _id: "item-medical",
            itemName: "胃薬",
            amountYen: 980,
            confidence: { itemName: 0.85, amountYen: 0.95, categoryName: 0.5 },
            warnings: ["品名が不鮮明です"],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("region", { name: "商品一覧" })).toBeInTheDocument();
    const amountCheck = within(dialog).getByRole("region", { name: "確認結果" });
    expect(within(amountCheck).getByText("支払額")).toBeInTheDocument();
    expect(within(amountCheck).getByText("1,380円")).toBeInTheDocument();
    expect(within(amountCheck).getByText("1,130円")).toBeInTheDocument();
    expect(within(dialog).getByText("低信頼度")).toBeInTheDocument();
    const initialCategoryInputs = within(dialog).getAllByLabelText("明細カテゴリ");
    expect(initialCategoryInputs).toHaveLength(2);
    expect(initialCategoryInputs[0]).toHaveValue("食費");
    expect(initialCategoryInputs[1]).toHaveValue("日用品");

    await user.click(initialCategoryInputs[0]);
    await user.click(screen.getByRole("option", { name: "日用品" }));
    expect(within(dialog).getAllByLabelText("明細カテゴリ")[0]).toHaveValue("日用品");

    await user.clear(within(dialog).getByDisplayValue("150"));
    await user.type(within(dialog).getAllByLabelText("レシートの金額")[0], "400");
    await user.click(within(dialog).getByRole("button", { name: "胃薬を削除" }));
    await user.click(within(dialog).getByRole("button", { name: "明細を追加" }));

    const itemNameInputs = within(dialog).getAllByLabelText("明細名");
    const amountInputs = within(dialog).getAllByLabelText("レシートの金額");
    await user.type(itemNameInputs[1], "牛乳");
    await user.type(amountInputs[1], "980");
    const categoryInputs = within(dialog).getAllByLabelText("明細カテゴリ");
    await user.click(categoryInputs[0]);
    await user.click(screen.getByRole("option", { name: "食費" }));
    await user.click(categoryInputs[1]);
    await user.click(screen.getByRole("option", { name: "食費" }));
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith({
      draftId: "draft-review",
      documentType: "receipt",
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1380,
      categoryId: "cat-daily",
      registrationMode: "detailed",
      items: [
        expect.objectContaining({
          itemName: "パン",
          amountYen: 400,
          categoryId: "cat-food",
        }),
        expect.objectContaining({
          itemName: "牛乳",
          amountYen: 980,
          categoryId: "cat-food",
        }),
      ],
    });
    const submittedItems = updateForReviewMock.mock.calls.at(-1)?.[0].items;
    expect(submittedItems[0]).toMatchObject({ itemId: "item-food" });
    expect(submittedItems[1]).not.toHaveProperty("itemId");
  }, 20_000);

  it("割引明細は負数で編集し、対象カテゴリの正味額として保存できる", async () => {
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
          shopName: "クスリキリン堂 稲美店",
          date: "2026-06-29",
          amountYen: 990,
          categoryId: "cat-daily",
          reviewReasons: ["amount_mismatch"],
          warnings: [],
        },
        items: [
          {
            _id: "item-daily",
            itemName: "キュレル ジェルメイク",
            amountYen: 1100,
            categoryId: "cat-daily",
            confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
            warnings: [],
          },
          {
            _id: "item-discount",
            itemName: "クーポン券割引 10%",
            amountYen: -100,
            categoryId: "cat-daily",
            confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
            warnings: [],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");

    const amountInputs = within(dialog).getAllByLabelText("レシートの金額");
    expect(amountInputs[1]).toHaveAttribute("inputmode", "text");
    await user.clear(amountInputs[1]);
    await user.type(amountInputs[1], "-110");
    expect(amountInputs[1]).toHaveValue("-110");
    const amountCheck = within(dialog).getByRole("region", { name: "確認結果" });
    expect(within(amountCheck).getByText(/明細合計 990円/)).toBeVisible();
    expect(within(amountCheck).getByText(/支払額 990円/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            categoryId: "cat-daily",
          }),
        ]),
      }),
    );
  });

  it("対象不明の割引でも直前商品が自動選択され保存できる", async () => {
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
          shopName: "クスリキリン堂 稲美店",
          date: "2026-06-29",
          amountYen: 990,
          categoryId: "cat-daily",
          reviewReasons: ["ambiguous_category"],
          warnings: [],
        },
        items: [
          {
            _id: "item-daily",
            itemName: "キュレル ジェルメイク",
            amountYen: 1100,
            categoryId: "cat-daily",
            confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
            warnings: [],
          },
          {
            _id: "item-discount",
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            confidence: { itemName: 0.9, amountYen: 0.9, categoryName: 0.4 },
            warnings: ["割引対象が不明です"],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText("対象商品のカテゴリから減額します")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            categoryId: "cat-daily",
          }),
        ]),
      }),
    );
  });
});
