import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RECEIPT_TAX_CHOICE_FIELDS } from "../../../../lib/domain/aiExpenseDrafts/receiptDataContract";
import { ReviewDialog } from "../components/ReviewDialog";
import type { AiExpenseDraft, AiExpenseDraftItem } from "../types/types";
import { useReviewDialog } from "./useReviewDialog";

const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => mutation }));

const categories = [
  { _id: "food", name: "食費", color: "#886644" },
  { _id: "other", name: "その他", color: "#446688" },
];
const initialItem: AiExpenseDraftItem = {
  _id: "item",
  itemName: "商品",
  amountYen: 100,
  printedAmountYen: 100,
  amountBasis: "tax_excluded",
  taxRatePercent: 8,
  allocatedTaxYen: 8,
  normalizedAmountYen: 108,
  taxAllocationStatus: "allocated",
  taxResolutionStatus: "resolved",
  taxResolutionSource: "item_explicit",
  categoryId: "food",
};

function savedGlobalChoiceDraft(): AiExpenseDraft {
  const draft: AiExpenseDraft = {
    _id: "draft",
    status: "needs_review",
    documentType: "receipt",
    shopName: "テスト店舗",
    date: "2026-10-05",
    amountYen: 108,
    categoryId: "food",
    reviewReasons: [],
    receiptTaxDecision: {
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
      resolutionStatus: "verified",
      resolutionSource: "user",
      evidence: [],
      reasons: [],
      candidates: [],
      taxAmount: { roundingMethod: "round", source: "estimated", estimatedTaxYen: 8 },
    },
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "external",
        taxableAmountYen: 100,
        taxableAmountBasis: "tax_excluded",
        taxYen: 8,
        roundingMethod: "round",
        warnings: [],
      },
    ],
  };
  draft.receiptUserOverride = {
    source: "user",
    updatedAt: 1,
    fields: Object.values(RECEIPT_TAX_CHOICE_FIELDS),
    values: {
      status: draft.status,
      documentType: draft.documentType,
      shopName: draft.shopName,
      date: draft.date,
      amountYen: draft.amountYen,
      categoryId: draft.categoryId,
      receiptTaxDecision: draft.receiptTaxDecision,
      taxSummaries: draft.taxSummaries?.map((summary) => ({ ...summary, confidence: {} })),
      confidence: {},
      warnings: [],
      reviewReasons: [],
      items: [{ ...initialItem, confidence: {} }],
    },
  };
  return draft;
}

type ReviewState = ReturnType<typeof useReviewDialog>;
const corrections = [
  {
    label: "個別税率",
    item: {
      ...initialItem,
      taxRatePercent: 10 as const,
      taxAllocationStatus: "unallocated" as const,
    },
    change: (review: ReviewState) => review.handleTaxRateChange("item", 10),
  },
  {
    label: "個別の税込／税抜",
    item: {
      ...initialItem,
      amountBasis: "tax_included" as const,
      taxAllocationStatus: "unallocated" as const,
    },
    change: (review: ReviewState) => review.handleAmountBasisChange("item", "tax_included"),
  },
  {
    label: "税内訳",
    item: { ...initialItem, taxAllocationStatus: "unallocated" as const },
    summary: { taxableAmountYen: 200, taxYen: 16 },
    change: (review: ReviewState) =>
      review.handleTaxSummaryChange(0, { taxableAmountYen: 200, taxYen: 16 }),
  },
  {
    label: "全体税の再計算",
    item: initialItem,
    change: (review: ReviewState) => review.handleApplyReceiptTaxSettings(),
  },
];

describe("税修正応答と全体税設定の同期", () => {
  it.each(corrections)(
    "$label の成功後は古い全体設定を再適用・再送しない",
    async ({ item, summary, change }) => {
      mutation.mockReset();
      const user = userEvent.setup();
      const draft = savedGlobalChoiceDraft();
      const onReviewSubmit = vi
        .fn()
        .mockResolvedValue({ status: "needs_review", reviewReasons: [] });
      const { result } = renderHook(() =>
        useReviewDialog({
          initialReviewDrafts: { draft },
          initialReviewDraftItems: { draft: [initialItem] },
          categories,
          onReviewSubmit,
        }),
      );
      act(() => result.current.handleOpenReview("draft"));
      expect(result.current.reviewForm).toMatchObject({
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate8",
      });
      act(() => {
        result.current.handleReviewFieldChange("shopName", "未保存の店名");
        result.current.handleReviewFieldChange("date", "2026-10-04");
        result.current.handleReviewFieldChange("amountYen", "109");
        result.current.handleReviewFieldChange("categoryId", "other");
        result.current.handleReviewItemChange("item", "itemName", "未保存の商品名");
      });

      const updatedItems = [
        {
          ...item,
          allocatedTaxYen: item.taxAllocationStatus === "allocated" ? 8 : 0,
          normalizedAmountYen: item.taxAllocationStatus === "allocated" ? 108 : 100,
        },
      ];
      const updatedDraft = {
        ...draft,
        taxSummaries: [{ ...draft.taxSummaries![0], ...summary }],
        receiptUserOverride: {
          ...draft.receiptUserOverride!,
          // 商品・内訳の補正後はサーバーが以前の全体choiceを解除する。
          fields: ["receiptTaxDecision", summary ? "taxSummaries" : "items"],
          values: { ...draft.receiptUserOverride!.values, items: updatedItems },
        },
      };
      mutation.mockResolvedValue({ draft: updatedDraft, items: updatedItems });
      act(() => change(result.current));
      await waitFor(() => expect(mutation).toHaveBeenCalledOnce());
      await waitFor(() => expect(result.current.selectedReviewDraft).toEqual(updatedDraft));
      expect(result.current.reviewForm).toMatchObject({
        priceTaxTreatment: undefined,
        taxRateComposition: undefined,
        shopName: "未保存の店名",
        date: "2026-10-04",
        amountYen: "109",
        categoryId: "other",
        registrationMode: "detailed",
      });
      expect(result.current.reviewItems[0]).toMatchObject({
        taxRatePercent: item.taxRatePercent,
        amountBasis: item.amountBasis,
        taxAllocationStatus: item.taxAllocationStatus,
        itemName: "未保存の商品名",
        categoryId: "other",
      });

      const review = result.current;
      render(
        <ReviewDialog
          open
          categories={categories}
          isReviewDraftLoading={false}
          isReviewDraftNotFound={false}
          selectedReviewDraft={review.selectedReviewDraft}
          reviewError={review.reviewError}
          reviewForm={review.reviewForm}
          reviewItems={review.reviewItems}
          isCategorySplit={review.isCategorySplit}
          reviewSubmitting={review.reviewSubmitting}
          onClose={review.handleCloseReview}
          onFieldChange={review.handleReviewFieldChange}
          onItemChange={review.handleReviewItemChange}
          onAddItem={review.handleAddReviewItem}
          onRemoveItem={review.handleRemoveReviewItem}
          onCategorySplitChange={review.handleCategorySplitChange}
          onAssignCategoryToItems={review.handleAssignCategoryToItems}
          onDiscountTargetChange={review.handleDiscountTargetChange}
          onSubmit={review.handleSubmitReview}
          onResetToAiInterpretation={review.handleResetToAiInterpretation}
          onTaxRateChange={review.handleTaxRateChange}
          onAmountBasisChange={review.handleAmountBasisChange}
          onTaxSummaryChange={review.handleTaxSummaryChange}
        />,
      );
      const card = screen.getByText("未保存の商品名").closest("details")!;
      await user.click(card.querySelector("summary")!);
      if (item.taxAllocationStatus === "unallocated") {
        expect(within(card).getByText("登録額（税込）：未確定")).toBeVisible();
        expect(screen.queryByText("登録額: 108円（税込）")).not.toBeInTheDocument();
      }

      await act(() => result.current.handleSubmitReview(false));
      expect(onReviewSubmit).toHaveBeenCalledWith(
        "draft",
        expect.objectContaining({
          shopName: "未保存の店名",
          date: "2026-10-04",
          amountYen: 109,
          categoryId: "other",
          priceTaxTreatment: undefined,
          taxRateComposition: undefined,
          items: [expect.objectContaining({ itemName: "未保存の商品名", categoryId: "other" })],
        }),
        false,
      );
    },
  );
});
