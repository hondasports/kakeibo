import type { AiExpenseDraft, AiExpenseDraftItem } from "../types/types";
import type {
  AiExpenseQueuePanelProps,
  AiExpenseQueueCategory,
} from "../../ai-expense-queue/types/types";
import { useReviewDraftSelection } from "./useReviewDraftSelection";
import { useReviewFormState } from "./useReviewFormState";
import { useReviewSubmit } from "./useReviewSubmit";
import { useReviewTaxOverrides } from "./useReviewTaxOverrides";
import { useReviewTaxSummaryOverrides } from "./useReviewTaxSummaryOverrides";

export function useReviewDialog({
  initialReviewDrafts,
  initialReviewDraftItems,
  categories,
  onReviewSubmit,
  onRegister,
}: {
  initialReviewDrafts: Record<string, AiExpenseDraft>;
  initialReviewDraftItems: Record<string, AiExpenseDraftItem[]>;
  categories: AiExpenseQueueCategory[];
  onReviewSubmit?: AiExpenseQueuePanelProps["onReviewSubmit"];
  onRegister?: (draftId: string) => void;
}) {
  const draftSelection = useReviewDraftSelection({
    initialReviewDrafts,
    initialReviewDraftItems,
  });

  const formState = useReviewFormState({
    selectedReviewDraftId: draftSelection.selectedReviewDraftId,
    selectedReviewDraft: draftSelection.selectedReviewDraft,
    localReviewItems: draftSelection.localReviewItems,
    selectedReviewDraftDetails: draftSelection.selectedReviewDraftDetails,
  });

  const submit = useReviewSubmit({
    categoryName: categories.find((category) => category._id === formState.reviewForm.categoryId)
      ?.name,
    selectedReviewDraftId: draftSelection.selectedReviewDraftId,
    reviewForm: formState.reviewForm,
    reviewItems: formState.reviewItems,
    onReviewSubmit,
    onRegister,
    clearSelection: draftSelection.clearSelection,
    resetForm: formState.resetForm,
    setReviewForm: formState.setReviewForm,
  });

  const taxOverrides = useReviewTaxOverrides({
    selectedReviewDraftId: draftSelection.selectedReviewDraftId,
    setReviewItems: formState.setReviewItems,
    setReviewDraftOverride: draftSelection.setReviewDraftOverride,
    setReviewError: submit.setReviewError,
  });

  const taxSummaryOverrides = useReviewTaxSummaryOverrides({
    selectedReviewDraftId: draftSelection.selectedReviewDraftId,
    setReviewDraftOverride: draftSelection.setReviewDraftOverride,
    setReviewItems: formState.setReviewItems,
    setReviewError: submit.setReviewError,
  });

  const handleOpenReview = (itemId: string) => {
    draftSelection.setReviewDraftOverride(null);
    draftSelection.setSelectedReviewDraftId(itemId);
    formState.prepareForDraft();
    submit.clearReviewError();
  };

  const handleCloseReview = () => {
    if (submit.reviewSubmitting) {
      return;
    }
    draftSelection.clearSelection();
    formState.resetForm();
    submit.clearReviewError();
  };

  return {
    selectedReviewDraftId: draftSelection.selectedReviewDraftId,
    initializedReviewDraftId: formState.initializedReviewDraftId,
    selectedReviewDraft: draftSelection.selectedReviewDraft,
    isReviewDraftLoading: draftSelection.isReviewDraftLoading,
    isReviewDraftNotFound: draftSelection.isReviewDraftNotFound,
    reviewForm: formState.reviewForm,
    reviewItems: formState.reviewItems,
    isCategorySplit: formState.isCategorySplit,
    reviewError: submit.reviewError,
    reviewSaveFeedback: submit.reviewSaveFeedback,
    reviewSubmitting: submit.reviewSubmitting,
    setSelectedReviewDraftId: draftSelection.setSelectedReviewDraftId,
    setInitializedReviewDraftId: formState.setInitializedReviewDraftId,
    setReviewForm: formState.setReviewForm,
    setReviewItems: formState.setReviewItems,
    setReviewError: submit.setReviewError,
    setReviewSubmitting: submit.setReviewSubmitting,
    handleOpenReview,
    handleCloseReview,
    clearReviewSaveFeedback: submit.clearReviewSaveFeedback,
    handleReviewFieldChange: formState.handleReviewFieldChange,
    handleReviewItemChange: formState.handleReviewItemChange,
    handleAddReviewItem: formState.handleAddReviewItem,
    handleRemoveReviewItem: formState.handleRemoveReviewItem,
    handleCategorySplitChange: formState.handleCategorySplitChange,
    handleAssignCategoryToItems: formState.handleAssignCategoryToItems,
    handleDiscountTargetChange: formState.handleDiscountTargetChange,
    handleSubmitReview: submit.handleSubmitReview,
    handleResetToAiInterpretation: submit.handleResetToAiInterpretation,
    taxUpdatingItemId: taxOverrides.taxUpdatingItemId,
    isApplyingReceiptTax: taxOverrides.isApplyingReceiptTax,
    handleTaxRateChange: taxOverrides.handleTaxRateChange,
    handleAmountBasisChange: taxOverrides.handleAmountBasisChange,
    handleApplyReceiptTaxSettings: taxOverrides.handleApplyReceiptTaxSettings,
    taxSummaryUpdatingIndex: taxSummaryOverrides.taxSummaryUpdatingIndex,
    handleTaxSummaryChange: taxSummaryOverrides.handleTaxSummaryChange,
  };
}
