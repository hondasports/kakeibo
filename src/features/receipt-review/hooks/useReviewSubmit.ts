import { api } from "../../../../convex/_generated/api";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getReviewSubmitError } from "../../receipt-review/utils/reviewValidation";
import { toUserFacingReviewError } from "../../receipt-review/utils/userFacingErrors";
import type { ReviewFormValues, ReviewItemValues } from "../types/types";
import type { AiExpenseQueuePanelProps } from "../../ai-expense-queue/types/types";
import { prepareReviewItemsForSubmit } from "../utils/reviewItemCategories";
import { formatReviewSaveMessage } from "../utils/reviewFeedback";

export function useReviewSubmit({
  selectedReviewDraftId,
  reviewForm,
  reviewItems,
  categoryName,
  onReviewSubmit,
  onRegister,
  clearSelection,
  resetForm,
  setReviewForm,
}: {
  selectedReviewDraftId: string | null;
  reviewForm: ReviewFormValues;
  reviewItems: ReviewItemValues[];
  categoryName?: string;
  onReviewSubmit?: AiExpenseQueuePanelProps["onReviewSubmit"];
  onRegister?: (draftId: string) => void;
  clearSelection: () => void;
  resetForm: () => void;
  setReviewForm: Dispatch<SetStateAction<ReviewFormValues>>;
}) {
  const [reviewError, setReviewError] = useState("");
  const [reviewSaveFeedback, setReviewSaveFeedback] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const updateForReview = useMutation(api.aiExpenseDrafts.mutations.updateForReview);
  const resetReceiptToAiInterpretation = useMutation(
    api.aiExpenseDrafts.mutations.resetReceiptToAiInterpretation,
  );
  const registerReadyDraftsAsExpenseEntries = useMutation(
    api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries,
  );

  const handleResetToAiInterpretation = async () => {
    if (!selectedReviewDraftId) {
      return;
    }

    setReviewSubmitting(true);
    setReviewError("");
    try {
      await resetReceiptToAiInterpretation({
        draftId: selectedReviewDraftId as Id<"aiExpenseDrafts">,
      });
      setReviewSaveFeedback({
        message: "ユーザー補正を解除し、AI判定へ戻しました。",
        severity: "success",
      });
      clearSelection();
      resetForm();
    } catch (error) {
      const message = toUserFacingReviewError(error);
      setReviewError(message);
      setReviewSaveFeedback({ message, severity: "error" });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleSubmitReview = async (
    registerAfterUpdate: boolean,
    registrationModeOverride?: ReviewFormValues["registrationMode"],
  ) => {
    if (!selectedReviewDraftId) {
      return;
    }
    const hasUnknownTaxChoice =
      reviewForm.priceTaxTreatment === "unknown" || reviewForm.taxRateComposition === "unknown";
    const effectiveRegistrationMode = hasUnknownTaxChoice ? "totalOnly" : registrationModeOverride;
    const submittedForm = effectiveRegistrationMode
      ? { ...reviewForm, registrationMode: effectiveRegistrationMode }
      : reviewForm;
    if (effectiveRegistrationMode !== undefined) {
      setReviewForm((current) => ({ ...current, registrationMode: effectiveRegistrationMode }));
    }
    const validationError = getReviewSubmitError(submittedForm, reviewItems);
    if (validationError) {
      setReviewError(validationError);
      return;
    }
    const amountYen = Number(submittedForm.amountYen);
    const submittedItems = prepareReviewItemsForSubmit(reviewItems, submittedForm.categoryId);

    setReviewSubmitting(true);
    setReviewError("");
    try {
      if (onReviewSubmit) {
        const updated = await onReviewSubmit(
          selectedReviewDraftId,
          {
            documentType: submittedForm.documentType,
            shopName: submittedForm.shopName,
            date: submittedForm.date,
            amountYen,
            categoryId: submittedForm.categoryId,
            registrationMode: submittedForm.registrationMode,
            priceTaxTreatment: submittedForm.priceTaxTreatment,
            taxRateComposition: submittedForm.taxRateComposition,
            items: submittedItems.map((item) => ({
              itemName: item.itemName.trim(),
              lineType: item.lineType,
              amountYen: Number(item.amountYen),
              categoryId: item.categoryId,
            })),
          },
          registerAfterUpdate,
        );
        setReviewSaveFeedback({
          message: formatReviewSaveMessage({
            amountYen,
            categoryName,
            reviewReasons: updated.reviewReasons,
            shopName: submittedForm.shopName,
            status: updated.status === "needs_review" ? "needs_review" : "ready",
          }),
          severity: "success",
        });
        clearSelection();
        resetForm();
      } else {
        const updated = await updateForReview({
          draftId: selectedReviewDraftId as Id<"aiExpenseDrafts">,
          documentType: submittedForm.documentType,
          shopName: submittedForm.shopName,
          date: submittedForm.date,
          amountYen,
          categoryId: submittedForm.categoryId as Id<"categories">,
          registrationMode: submittedForm.registrationMode,
          priceTaxTreatment: submittedForm.priceTaxTreatment,
          taxRateComposition: submittedForm.taxRateComposition,
          items: submittedItems.map((item) => ({
            ...(item.persistedItemId
              ? { itemId: item.persistedItemId as Id<"aiExpenseDraftItems"> }
              : {}),
            itemName: item.itemName.trim(),
            lineType: item.lineType,
            amountYen: Number(item.amountYen),
            categoryId: item.categoryId as Id<"categories">,
            confidence: {
              ...item.confidence,
              itemName: 1,
              amountYen: 1,
              categoryId: 1,
            },
            warnings: item.warnings ?? [],
          })),
        });

        if (registerAfterUpdate) {
          onRegister?.(selectedReviewDraftId);
          await registerReadyDraftsAsExpenseEntries({
            draftIds: [selectedReviewDraftId as Id<"aiExpenseDrafts">],
          });
        }

        setReviewSaveFeedback({
          message: formatReviewSaveMessage({
            amountYen,
            categoryName,
            reviewReasons: updated.reviewReasons ?? [],
            shopName: submittedForm.shopName,
            status: updated.status === "needs_review" ? "needs_review" : "ready",
          }),
          severity: "success",
        });

        clearSelection();
        resetForm();
      }
    } catch (error) {
      const message = toUserFacingReviewError(error);
      setReviewError(message);
      setReviewSaveFeedback({ message, severity: "error" });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const clearReviewError = () => {
    setReviewError("");
  };

  const clearReviewSaveFeedback = () => {
    setReviewSaveFeedback(null);
  };

  return {
    reviewError,
    reviewSaveFeedback,
    reviewSubmitting,
    setReviewError,
    setReviewSubmitting,
    handleSubmitReview,
    handleResetToAiInterpretation,
    clearReviewError,
    clearReviewSaveFeedback,
  };
}
