import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReviewFormState } from "./useReviewFormState";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { RECEIPT_TAX_CHOICE_FIELDS } from "../../../../lib/domain/aiExpenseDrafts/receiptDataContract";

function item(id: string, rate: 8 | 10): ReviewItemValues {
  return {
    id,
    itemName: "商品",
    amountYen: "100",
    printedAmountYen: 100,
    categoryId: "cat",
    amountBasis: "tax_excluded",
    taxRatePercent: rate,
    taxResolutionStatus: "resolved",
  };
}

describe("明細削除後の税条件", () => {
  it("保存済み全体税選択を初期表示の再計算にも適用する", () => {
    const draft: AiExpenseDraft = {
      _id: "draft",
      status: "needs_review",
      documentType: "receipt",
      amountYen: 216,
      categoryId: "cat",
      reviewReasons: [],
      receiptTaxDecision: {
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate8",
        resolutionStatus: "verified",
        resolutionSource: "user",
        evidence: [],
        reasons: [],
        candidates: [],
        taxAmount: { roundingMethod: "round", source: "estimated", estimatedTaxYen: 16 },
      },
      receiptUserOverride: {
        source: "user",
        updatedAt: 1,
        fields: Object.values(RECEIPT_TAX_CHOICE_FIELDS),
        values: {
          status: "needs_review",
          documentType: "receipt",
          amountYen: 216,
          confidence: {},
          warnings: [],
          reviewReasons: [],
          items: [],
        },
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
    const { result } = renderHook(() =>
      useReviewFormState({
        selectedReviewDraftId: draft._id,
        selectedReviewDraft: draft,
        localReviewItems: [
          { itemName: "商品", amountYen: 200, printedAmountYen: 200, categoryId: "cat" },
        ],
        selectedReviewDraftDetails: null,
      }),
    );
    expect(result.current.reviewForm).toMatchObject({
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate8",
    });
    expect(result.current.reviewItems[0]).toMatchObject({
      normalizedAmountYen: 216,
      allocatedTaxYen: 16,
      taxAllocationStatus: "allocated",
    });
  });

  it.each([8, 10] as const)("全体8%%選択後の個別%d%%を保持する", (rate) => {
    const { result } = renderHook(() =>
      useReviewFormState({
        selectedReviewDraftId: null,
        selectedReviewDraft: null,
        localReviewItems: undefined,
        selectedReviewDraftDetails: null,
      }),
    );
    act(() => {
      result.current.setReviewForm((f) => ({
        ...f,
        amountYen: "216",
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate8",
      }));
      result.current.setReviewItems([item("keep", rate), item("remove", 8)]);
    });
    act(() => result.current.handleRemoveReviewItem("remove"));
    expect(result.current.reviewItems).toHaveLength(1);
    expect(result.current.reviewItems[0].taxRatePercent).toBe(rate);
    if (rate === 8)
      expect(result.current.reviewItems[0]).toMatchObject({
        normalizedAmountYen: 108,
        allocatedTaxYen: 8,
        taxAllocationStatus: "allocated",
      });
    else expect(result.current.reviewItems[0].taxAllocationStatus).toBe("unallocated");
  });
});
