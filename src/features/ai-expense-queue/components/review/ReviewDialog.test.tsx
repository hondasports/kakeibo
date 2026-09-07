import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ReviewDialog } from "./ReviewDialog";

const props: ComponentProps<typeof ReviewDialog> = {
  open: true,
  categories: [{ _id: "food", name: "食費", color: "#886644" }],
  isReviewDraftLoading: false,
  isReviewDraftNotFound: false,
  selectedReviewDraft: {
    _id: "draft",
    status: "needs_review",
    documentType: "receipt",
    reviewReasons: [],
  },
  reviewError: "",
  reviewForm: {
    documentType: "receipt",
    shopName: "ジャパン",
    date: "2026-08-06",
    amountYen: "92",
    categoryId: "food",
    registrationMode: "detailed",
    priceTaxTreatment: "included",
    taxRateComposition: "mixed",
  },
  reviewItems: [
    {
      id: "food",
      itemName: "ホットケーキ",
      amountYen: "116",
      categoryId: "food",
      taxRatePercent: 8,
      taxResolutionStatus: "resolved",
    },
    { id: "discount", itemName: "割引", amountYen: "-24", categoryId: "food" },
  ],
  isCategorySplit: false,
  reviewSubmitting: false,
  onClose: vi.fn(),
  onFieldChange: vi.fn(),
  onItemChange: vi.fn(),
  onAddItem: vi.fn(),
  onRemoveItem: vi.fn(),
  onCategorySplitChange: vi.fn(),
  onAssignCategoryToItems: vi.fn(),
  onDiscountTargetChange: vi.fn(),
  onSubmit: vi.fn(),
  onResetToAiInterpretation: vi.fn(),
};

describe("下書きの修正導線", () => {
  it("税内訳の矛盾から折りたたみ内の修正欄へ移動できる", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDialog
        {...props}
        reviewItems={[]}
        selectedReviewDraft={{
          _id: "draft",
          status: "needs_review",
          documentType: "receipt",
          reviewReasons: [],
          taxSummaries: [
            {
              taxRatePercent: 8,
              taxMode: "included",
              taxableAmountYen: 92,
              taxableAmountBasis: "unknown",
              taxYen: 6,
              roundingMethod: "floor",
              warnings: [],
              status: "conflicting",
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "対象額" })).not.toBeVisible();
    await user.click(
      within(screen.getByRole("region", { name: "確認すること" })).getByRole("button", {
        name: "確認箇所へ",
      }),
    );
    expect(screen.getByRole("spinbutton", { name: "対象額" })).toBeVisible();
  });
  it("編集した商品は問題が解消しても閉じず、再編集できる", async () => {
    const user = userEvent.setup();
    const item = { ...props.reviewItems[0], persistedItemId: "food" };
    const { rerender } = render(<ReviewDialog {...props} reviewItems={[item]} />);
    const field = screen.getByRole("textbox", { name: "明細名" });
    await user.click(field);
    rerender(
      <ReviewDialog
        {...props}
        reviewItems={[
          {
            ...item,
            taxRatePercent: 8,
            amountBasis: "tax_included",
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            allocatedTaxYen: 8,
          },
        ]}
      />,
    );
    expect(field).toBeVisible();
    expect(field).toHaveFocus();
    await user.type(field, "修正");
    expect(props.onItemChange).toHaveBeenCalled();
  });
  it("保存前に割引の問題と対象選択への導線を示す", async () => {
    const user = userEvent.setup();
    render(<ReviewDialog {...props} />);
    const guidance = screen.getByRole("region", { name: "確認すること" });
    expect(within(guidance).getByText(/割引対象の商品を選択/)).toBeVisible();
    await user.click(within(guidance).getByRole("button", { name: "修正箇所へ" }));
    expect(screen.getByRole("combobox", { name: "割引対象の商品" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "割引対象の商品" })).toHaveFocus();
    const tax = screen.getByRole("region", { name: "価格ルール" });
    const details = screen.getByRole("region", { name: "商品と割引" });
    expect(tax.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("保存失敗をフッターにも示し、税更新中は保存を待つ", () => {
    render(
      <ReviewDialog
        {...props}
        reviewError="割引対象の商品を選択してください。"
        taxUpdatingItemId="food"
      />,
    );
    expect(screen.getByText(/入力は残っています/)).toBeVisible();
    expect(screen.getByRole("button", { name: "修正が必要な項目へ" })).toBeDisabled();
  });
});
