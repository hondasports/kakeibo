import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReviewFormState } from "./useReviewFormState";
import type { ReviewItemValues } from "../types/types";

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
