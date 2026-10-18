import { unprovenTargetReceipt } from "../../../../lib/domain/receipt/tax/fixtures/unprovenTargetReceipt";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReviewFormState } from "./useReviewFormState";
import type {
  AiExpenseDraft,
  ReviewItemValues,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
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
        normalizedAmountYen: 100,
        allocatedTaxYen: 0,
        taxAllocationStatus: "unallocated",
      });
    else expect(result.current.reviewItems[0].taxAllocationStatus).toBe("unallocated");
  });
});

it("初期化と金額変更で構造分類の決済行を税額へ流用しない", () => {
  const input = unprovenTargetReceipt();
  input.rawObservationLines![1].rawText = "カード決済 消費税額437円";
  const draft: AiExpenseDraft = {
    _id: "draft",
    status: "needs_review",
    documentType: "receipt",
    amountYen: input.amountYen,
    categoryId: "cat",
    reviewReasons: [],
    taxSummaries: input.taxSummaries,
    rawObservation: { source: "ai_ocr", observedAt: 0, lines: input.rawObservationLines! },
    receiptInterpretation: {
      source: "ai",
      interpretedAt: 0,
      values: {
        status: "needs_review",
        documentType: "receipt",
        confidence: {},
        warnings: [],
        reviewReasons: [],
        items: [],
        receiptLineClassifications: [
          {
            sourceLineIndex: 1,
            status: "ambiguous",
            candidates: [
              { role: "tax", score: 0.5, evidence: [] },
              { role: "paymentMethodAmount", score: 0.5, evidence: [] },
            ],
          },
        ],
      },
    },
  };
  const { result } = renderHook(() =>
    useReviewFormState({
      selectedReviewDraftId: draft._id,
      selectedReviewDraft: draft,
      localReviewItems: input.items.map((item) => ({
        ...item,
        amountYen: item.printedAmountYen!,
        categoryId: "cat",
      })),
      selectedReviewDraftDetails: null,
    }),
  );
  expect(
    result.current.reviewItems.some((item) => item.taxAllocationStatus === "unallocated"),
  ).toBe(true);
  act(() => result.current.handleReviewFieldChange("amountYen", "4810"));
  expect(
    result.current.reviewItems.some((item) => item.taxAllocationStatus === "unallocated"),
  ).toBe(true);
});

it("名前・行種別を変更した行だけ再確認を要求し、価格・カテゴリ変更では確認を保つ", () => {
  const { result } = renderHook(() =>
    useReviewFormState({
      selectedReviewDraftId: null,
      selectedReviewDraft: null,
      localReviewItems: undefined,
      selectedReviewDraftDetails: null,
    }),
  );
  act(() => {
    result.current.setReviewForm((f) => ({ ...f, amountYen: "200" }));
    result.current.setReviewItems([item("edit", 10), item("keep", 10)]);
  });
  act(() => result.current.handleReviewItemChange("edit", "itemName", "変更後"));
  expect(result.current.reviewItems[0].taxReviewReasons).toContain("item_identity_changed");
  expect(result.current.reviewItems[0].taxConfirmedFields).toEqual(["amountBasis"]);
  expect(result.current.reviewItems[1].taxReviewReasons ?? []).not.toContain(
    "item_identity_changed",
  );
  act(() => result.current.handleReviewFieldChange("taxRateComposition", "rate8"));
  expect(result.current.reviewItems[0].confirmedTaxRatePercent).toBe(8);
  act(() => result.current.handleReviewItemChange("edit", "itemName", "さらに変更"));
  expect(result.current.reviewItems[0].confirmedTaxRatePercent).toBeUndefined();
  expect(result.current.reviewItems[0].taxConfirmedFields).toEqual(["amountBasis"]);
  act(() => result.current.handleReviewItemChange("keep", "amountYen", "120"));
  expect(result.current.reviewItems[1].taxConfirmedFields).toEqual([
    "amountBasis",
    "taxRatePercent",
  ]);
  act(() => result.current.handleReviewItemChange("keep", "categoryId", "cat2"));
  expect(result.current.reviewItems[1].taxConfirmedFields).toEqual([
    "amountBasis",
    "taxRatePercent",
  ]);
});
