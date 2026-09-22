import { applyReviewItemsTaxPreview } from "../utils/reviewItemsTaxPreview";
import type { Dispatch, SetStateAction } from "react";
import { mergeReviewTaxItems } from "../utils/reviewTaxItemMerge";
import { useMutation } from "convex/react";
import { updateSummaryTaxOverridesApi } from "../../../lib/repositories/aiExpenseDrafts";
import { useRef, useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { mapConvexDraftToAiExpenseDraft, mapDraftItemsToReviewItems } from "../utils/mappers";
import type { AmountBasis, TaxMode, TaxRatePercent } from "../../../../lib/receiptTax/types";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { toUserFacingReviewError } from "../../receipt-review/utils/userFacingErrors";

export type TaxSummaryOverrideFields = {
  taxRatePercent?: TaxRatePercent;
  taxMode?: TaxMode;
  taxableAmountYen?: number;
  taxableAmountBasis?: AmountBasis;
  taxYen?: number;
  taxIncludedAmountYen?: number;
};

export function useReviewTaxSummaryOverrides({
  selectedReviewDraftId,
  setReviewDraftOverride,
  setReviewItems,
  setReviewError,
}: {
  selectedReviewDraftId: string | null;
  setReviewDraftOverride: (draft: AiExpenseDraft) => void;
  setReviewItems: Dispatch<SetStateAction<ReviewItemValues[]>>;
  setReviewError: (error: string) => void;
}) {
  const [taxSummaryUpdatingIndex, setTaxSummaryUpdatingIndex] = useState<number | null>(null);
  const taxSummaryOverrideRequestIdRef = useRef(0);
  const updateSummaryTaxOverrides = useMutation(updateSummaryTaxOverridesApi());

  const applyTaxSummaryOverride = async (
    summaryIndex: number,
    overrides: TaxSummaryOverrideFields,
  ) => {
    if (!selectedReviewDraftId) {
      return;
    }
    const requestId = ++taxSummaryOverrideRequestIdRef.current;
    setTaxSummaryUpdatingIndex(summaryIndex);
    setReviewError("");
    try {
      const result = await updateSummaryTaxOverrides({
        draftId: selectedReviewDraftId as Id<"aiExpenseDrafts">,
        summaryIndex,
        ...overrides,
      });
      if (requestId !== taxSummaryOverrideRequestIdRef.current) {
        return;
      }
      setReviewDraftOverride(mapConvexDraftToAiExpenseDraft(result.draft));
      // Tax summary override may change item allocations, so we refresh review items too.
      setReviewItems((current) =>
        mergeReviewTaxItems(
          current,
          applyReviewItemsTaxPreview(mapDraftItemsToReviewItems(result.items), {
            paidTotalYen: result.draft.amountYen,
            taxSummaries: result.draft.taxSummaries,
            markerDefinitions: result.draft.markerDefinitions,
          }),
        ),
      );
    } catch (error) {
      if (requestId !== taxSummaryOverrideRequestIdRef.current) {
        return;
      }
      setReviewError(toUserFacingReviewError(error));
    } finally {
      if (requestId === taxSummaryOverrideRequestIdRef.current) {
        setTaxSummaryUpdatingIndex(null);
      }
    }
  };

  return {
    taxSummaryUpdatingIndex,
    handleTaxSummaryChange: (summaryIndex: number, overrides: TaxSummaryOverrideFields) =>
      void applyTaxSummaryOverride(summaryIndex, overrides),
  };
}
