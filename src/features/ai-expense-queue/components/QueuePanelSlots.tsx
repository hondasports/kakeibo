import { Alert, Box, Snackbar } from "@mui/material";
import { designTokens } from "../../../designTokens";
import { useAiExpenseQueuePanelContext } from "../context/AiExpenseQueuePanelContext";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import { QueueActiveContent, QueueRegisteredContent } from "./QueueContent";
import { QueueEmptyState } from "./QueueEmptyState";
import { QueueHeader } from "./QueueHeader";
import { ReceiptImageConsentDialog } from "./ReceiptImageConsentDialog";
import { ReviewDialog } from "../../receipt-review/components/ReviewDialog";

function queueContentProps(queue: ReturnType<typeof useAiExpenseQueuePanelContext>) {
  return {
    clearableCount: queue.clearableItems.length,
    deletingIds: queue.deletingIds,
    groupedItems: queue.groupedItems,
    itemCount: queue.items.length,
    readyItems: queue.readyItems,
    registeringIds: queue.registeringIds,
    registrationError: queue.registrationError,
    selectedReadyIds: queue.selectedReadyIds,
    onClearOpenQueue: queue.handleClearOpenQueue,
    onDeleteQueueItem: queue.deleteQueueItem,
    onOpenReview: queue.handleOpenReview,
    onRegisterReady: queue.handleRegisterReady,
    onRetry: queue.handleRetry,
    onReanalyze: queue.handleReanalyze,
    retryingItemId: queue.retryingItemId,
    sessionBatchSummaries: queue.sessionBatchSummaries,
    unbatchedReadyItems: queue.unbatchedReadyItems,
    onToggleReadySelection: queue.handleToggleReadySelection,
  };
}

export function QueuePanelHeader({
  className,
  component = "div",
}: {
  className?: string;
  component?: React.ElementType;
}) {
  const queue = useAiExpenseQueuePanelContext();

  return (
    <Box
      aria-labelledby="ai-expense-queue-heading"
      className={className}
      component={component}
      sx={{ maxWidth: "100%", minWidth: 0 }}
    >
      <QueueHeader
        disabled={queue.consentIsLoading}
        inputRef={queue.inputRef}
        cameraInputRef={queue.cameraInputRef}
        retryInputRef={queue.retryInputRef}
        onFilesSelected={queue.handleFilesSelected}
        onRetryFileSelected={queue.handleRetryFileSelected}
      />

      {queue.retryError && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          variant="outlined"
          onClose={() => queue.setRetryError("")}
        >
          {queue.retryError}
        </Alert>
      )}

      {queue.queueDeleteError && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          variant="outlined"
          onClose={() => queue.setQueueDeleteError("")}
        >
          {queue.queueDeleteError}
        </Alert>
      )}
    </Box>
  );
}

export function QueuePanelActive({ className }: { className?: string }) {
  const queue = useAiExpenseQueuePanelContext();

  return (
    <Box className={className} sx={{ maxWidth: "100%", minWidth: 0 }}>
      {queue.items.length === 0 ? (
        <QueueEmptyState
          addReceiptDisabled={queue.consentIsLoading}
          onAddReceipt={() => queue.inputRef.current?.click()}
        />
      ) : (
        <QueueActiveContent {...queueContentProps(queue)} />
      )}
    </Box>
  );
}

export function QueuePanelRegistered({ className }: { className?: string }) {
  const queue = useAiExpenseQueuePanelContext();

  if (queue.items.length === 0) {
    return null;
  }

  return (
    <Box className={className} sx={{ maxWidth: "100%", minWidth: 0 }}>
      <QueueRegisteredContent
        deletingIds={queue.deletingIds}
        groupedItems={queue.groupedItems}
        registeringIds={queue.registeringIds}
        selectedReadyIds={queue.selectedReadyIds}
        onOpenReview={queue.handleOpenReview}
        onRegisterReady={queue.handleRegisterReady}
        onToggleReadySelection={queue.handleToggleReadySelection}
      />
    </Box>
  );
}

export function QueuePanelDialogs({ categories = [] }: { categories?: AiExpenseQueueCategory[] }) {
  const queue = useAiExpenseQueuePanelContext();
  const reviewSaveFeedback = queue.reviewSaveFeedback;
  const feedbackBackgroundColor =
    reviewSaveFeedback?.severity === "error"
      ? designTokens.color.error.main
      : designTokens.color.success.main;

  return (
    <>
      <ReviewDialog
        open={queue.selectedReviewDraftId !== null}
        categories={categories}
        isReviewDraftLoading={queue.isReviewDraftLoading}
        isReviewDraftNotFound={queue.isReviewDraftNotFound}
        selectedReviewDraft={queue.selectedReviewDraft}
        imageDataUrl={
          queue.items.find((item) => item.id === queue.selectedReviewDraftId)?.previewImageDataUrl
        }
        reviewError={queue.reviewError}
        reviewForm={queue.reviewForm}
        reviewItems={queue.reviewItems}
        isCategorySplit={queue.isCategorySplit}
        reviewSubmitting={queue.reviewSubmitting}
        onAddItem={queue.handleAddReviewItem}
        onClose={queue.handleCloseReview}
        onFieldChange={queue.handleReviewFieldChange}
        onItemChange={queue.handleReviewItemChange}
        onRemoveItem={queue.handleRemoveReviewItem}
        onCategorySplitChange={queue.handleCategorySplitChange}
        onAssignCategoryToItems={queue.handleAssignCategoryToItems}
        onDiscountTargetChange={queue.handleDiscountTargetChange}
        onSubmit={(registerAfterUpdate, registrationModeOverride) =>
          void queue.handleSubmitReview(registerAfterUpdate, registrationModeOverride)
        }
        onResetToAiInterpretation={() => void queue.handleResetToAiInterpretation()}
        taxUpdatingItemId={queue.taxUpdatingItemId}
        onTaxRateChange={queue.handleTaxRateChange}
        onAmountBasisChange={queue.handleAmountBasisChange}
        taxSummaryUpdatingIndex={queue.taxSummaryUpdatingIndex}
        onTaxSummaryChange={queue.handleTaxSummaryChange}
      />

      <ReceiptImageConsentDialog
        open={queue.consentDialogOpen}
        saving={queue.consentStatus === "saving"}
        onAccept={() => void queue.handleAcceptConsent()}
        onDecline={queue.handleDeclineConsent}
      />

      <Snackbar
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        autoHideDuration={4000}
        onClose={queue.clearReviewSaveFeedback}
        open={reviewSaveFeedback !== null}
        sx={{
          left: "50%",
          right: "auto",
          top: "calc(8px + env(safe-area-inset-top))",
          transform: "translateX(-50%)",
          width: { xs: "calc(100% - 24px)", sm: "min(560px, calc(100% - 48px))" },
        }}
      >
        <Alert
          aria-live="polite"
          icon={false}
          onClose={queue.clearReviewSaveFeedback}
          severity={reviewSaveFeedback?.severity ?? "success"}
          sx={{
            backgroundColor: feedbackBackgroundColor,
            color: designTokens.color.primary.contrastText,
            width: "100%",
            whiteSpace: "pre-line",
            "& .MuiAlert-action": { color: "inherit" },
          }}
          variant="filled"
        >
          {reviewSaveFeedback?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
