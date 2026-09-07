import type { Dispatch, SetStateAction } from "react";
import { mergeReviewTaxItems } from "../../utils/reviewTaxItemMerge";
import { useMutation } from "convex/react";
import {
  applyReceiptTaxSettingsApi,
  updateDraftItemTaxOverridesApi,
} from "../../../../lib/repositories/aiExpenseDrafts";
import { useRef, useState } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { mapConvexDraftToAiExpenseDraft, mapDraftItemsToReviewItems } from "../../utils/mappers";
import type { AmountBasis } from "../../../../../lib/receiptTax/types";
import type { ReviewItemValues, AiExpenseDraft } from "../../types/types";
import { toUserFacingReviewError } from "../../utils/userFacingErrors";

export function useReviewTaxOverrides({
  selectedReviewDraftId,
  setReviewItems,
  setReviewDraftOverride,
  setReviewError,
}: {
  selectedReviewDraftId: string | null;
  setReviewItems: Dispatch<SetStateAction<ReviewItemValues[]>>;
  setReviewDraftOverride: (draft: AiExpenseDraft) => void;
  setReviewError: (error: string) => void;
}) {
  const [taxUpdatingItemId, setTaxUpdatingItemId] = useState<string | null>(null);
  const [isApplyingReceiptTax, setIsApplyingReceiptTax] = useState(false);
  const taxOverrideRequestIdRef = useRef(0);
  const updateDraftItemTaxOverrides = useMutation(updateDraftItemTaxOverridesApi());
  const applyReceiptTaxSettings = useMutation(applyReceiptTaxSettingsApi());

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
        mergeReviewTaxItems(current, mapDraftItemsToReviewItems(result.items)),
      );
    } catch (error) {
      if (requestId !== taxOverrideRequestIdRef.current) {
        return;
      }
      setReviewError(toUserFacingReviewError(error));
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
        mergeReviewTaxItems(current, mapDraftItemsToReviewItems(result.items)),
      );
    } catch (error) {
      if (requestId !== taxOverrideRequestIdRef.current) {
        return;
      }
      setReviewError(toUserFacingReviewError(error));
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
    handleApplyReceiptTaxSettings: () => void handleApplyReceiptTaxSettings(),
  };
}
