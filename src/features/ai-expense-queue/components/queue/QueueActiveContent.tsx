import { Alert, Button, Divider, Stack, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { QueueContentProps } from "./queueContentTypes";
import { getQueueContentSummary } from "../../utils/queueContent";
import { QueueStatusHeader } from "./QueueStatusHeader";
import { QueueReadyRegisterPanel } from "./QueueReadyRegisterPanel";
import { QueueActiveSections } from "./QueueActiveSections";

const noopAsync = async () => {};

export function QueueActiveContent({
  clearableCount,
  deletingIds,
  groupedItems,
  readyItems,
  sessionBatchSummaries,
  unbatchedReadyItems,
  registeringIds,
  registrationError,
  registrationErrorDraftIds,
  selectedReadyIds,
  onClearOpenQueue,
  onDeleteQueueItem,
  onOpenReview,
  onRegisterReady,
  onRetry,
  onReanalyze = noopAsync,
  retryingItemId = null,
  onToggleReadySelection,
}: QueueContentProps) {
  const { firstReviewItem, prioritizedReviewItems } = getQueueContentSummary({
    groupedItems,
    readyItems,
    selectedReadyIds,
  });

  return (
    <Stack className="queue-content queue-content-active" spacing={2}>
      {registrationError && (
        <Alert
          action={
            registrationErrorDraftIds.length > 0 ? (
              <Button
                disabled={registeringIds.length > 0}
                onClick={() => void onRegisterReady(registrationErrorDraftIds)}
                size="small"
                type="button"
              >
                再試行
              </Button>
            ) : undefined
          }
          aria-live="assertive"
          severity="error"
          variant="outlined"
        >
          {registrationError}
          <Typography component="span" sx={{ display: "block" }} variant="body2">
            下書きは残っています。もう一度登録をお試しください。
          </Typography>
        </Alert>
      )}

      <QueueStatusHeader
        firstReviewItem={firstReviewItem}
        groupedItems={groupedItems}
        onOpenReview={onOpenReview}
      />

      {clearableCount > 0 && (
        <Button
          color="error"
          disabled={deletingIds.length > 0}
          onClick={() => void onClearOpenQueue()}
          startIcon={<DeleteIcon />}
          type="button"
          variant="outlined"
          sx={{ alignSelf: { xs: "stretch", md: "flex-start" } }}
        >
          未登録の画像をクリア（{clearableCount}件）
        </Button>
      )}

      <QueueReadyRegisterPanel
        batchSummary={undefined}
        readyItems={unbatchedReadyItems}
        selectedReadyIds={selectedReadyIds}
        registeringIds={registeringIds}
        onRegisterReady={onRegisterReady}
      />
      {sessionBatchSummaries.map((batchSummary) => (
        <QueueReadyRegisterPanel
          batchSummary={batchSummary}
          key={batchSummary.batchId}
          readyItems={batchSummary.readyItems}
          selectedReadyIds={selectedReadyIds}
          registeringIds={registeringIds}
          onRegisterReady={onRegisterReady}
        />
      ))}

      <Divider />

      <QueueActiveSections
        deletingIds={deletingIds}
        groupedItems={groupedItems}
        onDeleteQueueItem={onDeleteQueueItem}
        onOpenReview={onOpenReview}
        onRegisterReady={onRegisterReady}
        onRetry={onRetry}
        onReanalyze={onReanalyze}
        retryingItemId={retryingItemId}
        onToggleReadySelection={onToggleReadySelection}
        prioritizedReviewItems={prioritizedReviewItems}
        registeringIds={registeringIds}
        selectedReadyIds={selectedReadyIds}
      />
    </Stack>
  );
}
