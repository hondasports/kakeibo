import { api } from "../../../../convex/_generated/api";
import {
  applyReviewItemsTaxPreview,
  buildReviewTaxEvidence,
} from "../../../../lib/domain/aiExpenseDrafts/reviewItemsTaxPreview";
import type { Dispatch, SetStateAction } from "react";
import { mergeReviewTaxItems } from "../utils/reviewTaxItemMerge";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { mapConvexDraftToAiExpenseDraft } from "../utils/mappers";
import { mapDraftItemsToReviewItems } from "../../../../lib/domain/aiExpenseDrafts/reviewDraftMapping";
import type { AmountBasis } from "../../../../lib/domain/receipt/tax/types";
import type {
  ReviewItemValues,
  AiExpenseDraft,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import { getAiExpenseQueueReviewErrorMessage } from "../../../../lib/domain/aiExpenseDrafts/userFacingErrors";

export function useReviewTaxOverrides({
  selectedReviewDraftId,
  reviewItems,
  setReviewItems,
  setReviewDraftOverride,
  setReviewError,
}: {
  selectedReviewDraftId: string | null;
  reviewItems: ReviewItemValues[];
  setReviewItems: Dispatch<SetStateAction<ReviewItemValues[]>>;
  setReviewDraftOverride: (draft: AiExpenseDraft) => void;
  setReviewError: (error: string) => void;
}) {
  const [taxUpdatingItemId, setTaxUpdatingItemId] = useState<string | null>(null);
  const [isApplyingReceiptTax, setIsApplyingReceiptTax] = useState(false);
  const taxOverrideRequestIdRef = useRef(0);
  const updateDraftItemTaxOverrides = useMutation(
    api.aiExpenseDrafts.mutations.updateDraftItemTaxOverrides,
  );
  const applyReceiptTaxSettings = useMutation(
    api.aiExpenseDrafts.mutations.applyReceiptTaxSettings,
  );

  const applyTaxOverride = async (
    itemId: string,
    overrides: {
      taxRatePercent?: 0 | 8 | 10 | null;
      amountBasis?: AmountBasis;
    },
  ) => {
    if (!selectedReviewDraftId) {
      return;
    }
    const itemAtRequest = reviewItems.find((item) => item.id === itemId);
    const rateConfirmation =
      itemAtRequest && overrides.taxRatePercent !== undefined
        ? { ...itemAtRequest, taxRatePercent: overrides.taxRatePercent }
        : undefined;
    const requestId = ++taxOverrideRequestIdRef.current;
    setTaxUpdatingItemId(itemId);
    setReviewError("");
    try {
      const result = await updateDraftItemTaxOverrides({
        draftId: selectedReviewDraftId as Id<"aiExpenseDrafts">,
        itemId: itemId as Id<"aiExpenseDraftItems">,
        ...overrides,
      });
      if (requestId !== taxOverrideRequestIdRef.current) {
        return;
      }
      setReviewDraftOverride(mapConvexDraftToAiExpenseDraft(result.draft));
      setReviewItems((current) =>
        applyReviewItemsTaxPreview(
          mergeReviewTaxItems(
            current,
            mapDraftItemsToReviewItems(result.items),
            rateConfirmation ? [rateConfirmation] : undefined,
          ),
          {
            ...buildReviewTaxEvidence(result.draft),
            paidTotalYen: result.draft.amountYen,
          },
        ),
      );
    } catch (error) {
      if (requestId !== taxOverrideRequestIdRef.current) {
        return;
      }
      console.error("AI expense queue review failed", error);
      setReviewError(getAiExpenseQueueReviewErrorMessage());
    } finally {
      if (requestId === taxOverrideRequestIdRef.current) {
        setTaxUpdatingItemId(null);
      }
    }
  };

  const handleApplyReceiptTaxSettings = async () => {
    if (!selectedReviewDraftId) {
      return;
    }
    const requestId = ++taxOverrideRequestIdRef.current;
    const itemsAtRequest = reviewItems;
    setIsApplyingReceiptTax(true);
    setReviewError("");
    try {
      const result = await applyReceiptTaxSettings({
        draftId: selectedReviewDraftId as Id<"aiExpenseDrafts">,
      });
      if (requestId !== taxOverrideRequestIdRef.current) {
        return;
      }
      setReviewDraftOverride(mapConvexDraftToAiExpenseDraft(result.draft));
      setReviewItems((current) =>
        applyReviewItemsTaxPreview(
          mergeReviewTaxItems(
            current,
            mapDraftItemsToReviewItems(result.items),
            itemsAtRequest.flatMap((item) => {
              const updated = result.items.find((row) => row._id === item.id);
              return updated?.taxRatePercent != null
                ? [{ ...item, taxRatePercent: updated.taxRatePercent }]
                : [];
            }),
          ),
          {
            ...buildReviewTaxEvidence(result.draft),
            paidTotalYen: result.draft.amountYen,
          },
        ),
      );
    } catch (error) {
      if (requestId !== taxOverrideRequestIdRef.current) {
        return;
      }
      console.error("AI expense queue review failed", error);
      setReviewError(getAiExpenseQueueReviewErrorMessage());
    } finally {
      if (requestId === taxOverrideRequestIdRef.current) {
        setIsApplyingReceiptTax(false);
      }
    }
  };

  return {
    taxUpdatingItemId,
    isApplyingReceiptTax,
    handleTaxRateChange: (itemId: string, taxRatePercent: 0 | 8 | 10 | null) =>
      void applyTaxOverride(
        itemId,
        taxRatePercent === 0 ? { taxRatePercent, amountBasis: "tax_included" } : { taxRatePercent },
      ),
    handleAmountBasisChange: (itemId: string, amountBasis: AmountBasis) =>
      void applyTaxOverride(itemId, { amountBasis }),
    handleConfirmItemTax: (itemId: string, taxRatePercent: 0 | 8 | 10, amountBasis: AmountBasis) =>
      void applyTaxOverride(itemId, { taxRatePercent, amountBasis }),
    handleApplyReceiptTaxSettings: () => void handleApplyReceiptTaxSettings(),
  };
}
