import { useEffect } from "react";
import type { AiExpenseQueueItem, AiExpenseQueuePanelProps } from "../types/types";
import { useAiExpenseQueueData } from "./useAiExpenseQueueData";
import { useBulkRegister } from "./useBulkRegister";
import { useImageUpload } from "./useImageUpload";
import { useQueueDelete } from "./useQueueDelete";
import { useRetry } from "./useRetry";
import { useReviewDialog } from "../../receipt-review/hooks/useReviewDialog";

export function useAiExpenseQueuePanel({
  initialItems,
  categories,
  initialReviewDrafts,
  initialReviewDraftItems,
  onReviewSubmit,
}: Required<Pick<AiExpenseQueuePanelProps, "categories" | "initialReviewDrafts">> &
  Pick<AiExpenseQueuePanelProps, "initialItems" | "initialReviewDraftItems" | "onReviewSubmit">) {
  const imageUpload = useImageUpload();
  const queueDelete = useQueueDelete();
  const queueData = useAiExpenseQueueData({
    categories,
    hiddenItemIds: queueDelete.hiddenItemIds,
    initialItems,
    pendingImageDataUrls: imageUpload.pendingImageDataUrls,
    sessionBatches: imageUpload.sessionBatches,
  });
  const bulkRegister = useBulkRegister({
    readyItemIds: queueData.readyItemIds,
  });
  const reviewDialog = useReviewDialog({
    categories,
    initialReviewDrafts,
    initialReviewDraftItems: initialReviewDraftItems ?? {},
    onReviewSubmit,
  });
  const retry = useRetry({
    pendingImageDataUrls: imageUpload.pendingImageDataUrls,
    setPendingImageDataUrls: imageUpload.setPendingImageDataUrls,
  });
  const autoReviewJobId = imageUpload.autoReviewJobId;
  const autoReviewJob = queueData.jobs?.find((job) => job._id === autoReviewJobId);
  const selectedReviewDraftId = reviewDialog.selectedReviewDraftId;
  const handleOpenReview = reviewDialog.handleOpenReview;
  const setAutoReviewJobId = imageUpload.setAutoReviewJobId;

  useEffect(() => {
    if (!autoReviewJobId || !autoReviewJob) {
      return;
    }
    if (autoReviewJob.status === "queued" || autoReviewJob.status === "running") {
      return;
    }
    setAutoReviewJobId(null);
    if (
      autoReviewJob.status === "needs_review" &&
      autoReviewJob.draftId &&
      !selectedReviewDraftId
    ) {
      handleOpenReview(autoReviewJob.draftId);
    }
  }, [autoReviewJob, autoReviewJobId, handleOpenReview, selectedReviewDraftId, setAutoReviewJobId]);

  const wrappedDeleteQueueItem = async (item: AiExpenseQueueItem) => {
    const deleted = await queueDelete.deleteQueueItem(item);
    if (deleted) {
      imageUpload.removeSessionJob(item.jobId ?? item.id);
      bulkRegister.removeFromSelection(item.id);
    }
  };

  const wrappedHandleClearOpenQueue = async () => {
    for (const item of queueData.clearableItems) {
      await wrappedDeleteQueueItem(item);
    }
  };

  const wrappedHandleRetry = async (draftId: string) => {
    await retry.handleRetry(draftId, queueData.jobs);
  };

  const wrappedHandleReanalyze = async (draftId: string) => {
    await retry.handleReanalyze(draftId, queueData.jobs);
  };

  return {
    cameraInputRef: imageUpload.cameraInputRef,
    clearableItems: queueData.clearableItems,
    deletingIds: queueDelete.deletingIds,
    groupedItems: queueData.groupedItems,
    inputRef: imageUpload.inputRef,
    consentIsLoading: imageUpload.consentIsLoading,
    consentDialogOpen: imageUpload.consentDialogOpen,
    consentStatus: imageUpload.consentStatus,
    isReviewDraftLoading: reviewDialog.isReviewDraftLoading,
    isReviewDraftNotFound: reviewDialog.isReviewDraftNotFound,
    items: queueData.items,
    queueDeleteError: queueDelete.queueDeleteError,
    readyItems: queueData.readyItems,
    sessionBatchSummaries: queueData.sessionBatchSummaries,
    unbatchedReadyItems: queueData.unbatchedReadyItems,
    registeringIds: bulkRegister.registeringIds,
    registrationError: bulkRegister.registrationError,
    retryError: imageUpload.uploadError || retry.retryError,
    retryInputRef: retry.retryInputRef,
    retryingItemId: retry.retryingItemId,
    reviewError: reviewDialog.reviewError,
    reviewSaveFeedback: reviewDialog.reviewSaveFeedback,
    reviewForm: reviewDialog.reviewForm,
    reviewItems: reviewDialog.reviewItems,
    isCategorySplit: reviewDialog.isCategorySplit,
    reviewSubmitting: reviewDialog.reviewSubmitting,
    selectedReadyIds: bulkRegister.selectedReadyIds,
    selectedReviewDraft: reviewDialog.selectedReviewDraft,
    selectedReviewDraftId: reviewDialog.selectedReviewDraftId,
    setQueueDeleteError: queueDelete.setQueueDeleteError,
    setRetryError: (error: string) => {
      imageUpload.setUploadError("");
      retry.setRetryError(error);
    },
    handleClearOpenQueue: wrappedHandleClearOpenQueue,
    handleAcceptConsent: imageUpload.handleAcceptConsent,
    handleAddReviewItem: reviewDialog.handleAddReviewItem,
    handleCloseReview: reviewDialog.handleCloseReview,
    clearReviewSaveFeedback: reviewDialog.clearReviewSaveFeedback,
    handleFilesSelected: imageUpload.handleFilesSelected,
    handleDeclineConsent: imageUpload.handleDeclineConsent,
    handleOpenReview: reviewDialog.handleOpenReview,
    handleRegisterReady: bulkRegister.handleRegisterReady,
    handleRetry: wrappedHandleRetry,
    handleReanalyze: wrappedHandleReanalyze,
    handleRetryFileSelected: retry.handleRetryFileSelected,
    handleReviewFieldChange: reviewDialog.handleReviewFieldChange,
    handleReviewItemChange: reviewDialog.handleReviewItemChange,
    handleRemoveReviewItem: reviewDialog.handleRemoveReviewItem,
    handleCategorySplitChange: reviewDialog.handleCategorySplitChange,
    handleAssignCategoryToItems: reviewDialog.handleAssignCategoryToItems,
    handleDiscountTargetChange: reviewDialog.handleDiscountTargetChange,
    handleSubmitReview: reviewDialog.handleSubmitReview,
    handleResetToAiInterpretation: reviewDialog.handleResetToAiInterpretation,
    taxUpdatingItemId: reviewDialog.taxUpdatingItemId,
    handleTaxRateChange: reviewDialog.handleTaxRateChange,
    handleAmountBasisChange: reviewDialog.handleAmountBasisChange,
    isApplyingReceiptTax: reviewDialog.isApplyingReceiptTax,
    handleApplyReceiptTaxSettings: reviewDialog.handleApplyReceiptTaxSettings,
    taxSummaryUpdatingIndex: reviewDialog.taxSummaryUpdatingIndex,
    handleTaxSummaryChange: reviewDialog.handleTaxSummaryChange,
    handleToggleReadySelection: bulkRegister.handleToggleReadySelection,
    deleteQueueItem: wrappedDeleteQueueItem,
  };
}
