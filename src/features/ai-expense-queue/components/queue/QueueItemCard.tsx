import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { documentTypeLabels, getSectionKey } from "../labels";
import { ReviewReasonChips } from "../ReviewReasonChips";
import { StatusChip } from "../StatusChip";
import type { AiExpenseQueueItem } from "../../types/types";
import { formatYen } from "../../../../utils/currency";
import { getPrimaryReviewReason } from "../../utils/reviewFeedback";
import { formatQueueDate } from "./queueDisplayFormatters";
import { QueueItemActions } from "./QueueItemActions";

export function QueueItemCard({
  item,
  isSelected,
  onToggleReadySelection,
  onOpenReview,
  onRegisterItem,
  onRetry,
  onReanalyze,
  onDelete,
  onReturnToManualInput,
  isDeleting,
  isRegistering,
  isRetrying,
}: {
  item: AiExpenseQueueItem;
  isSelected: boolean;
  onToggleReadySelection: (itemId: string, checked: boolean) => void;
  onOpenReview: (itemId: string) => void;
  onRegisterItem: (itemId: string) => void;
  onRetry?: (itemId: string) => void;
  onReanalyze?: (itemId: string) => void;
  onDelete?: (item: AiExpenseQueueItem) => void;
  onReturnToManualInput?: (item: AiExpenseQueueItem) => void;
  isDeleting: boolean;
  isRegistering: boolean;
  isRetrying: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const secondaryLabel = item.fileName ?? "AI支出下書き";
  const canPreview = Boolean(item.previewImageDataUrl) && !imageLoadFailed;
  const [prevImageUrl, setPrevImageUrl] = useState(item.previewImageDataUrl);
  if (prevImageUrl !== item.previewImageDataUrl) {
    setPrevImageUrl(item.previewImageDataUrl);
    setImageLoadFailed(false);
    setPreviewOpen(false);
  }
  const metadata = [
    item.date ? formatQueueDate(item.date) : undefined,
    item.amountYen !== undefined ? `${formatYen(item.amountYen)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ・ ");
  const reviewReasons = Array.from(
    new Set([
      ...(item.reviewReasons ?? []),
      ...(item.hasUncategorizedItems ? ["ambiguous_category"] : []),
      ...(item.hasLowConfidenceItems ? ["low_confidence"] : []),
    ]),
  );
  const primaryReviewReason = getPrimaryReviewReason(reviewReasons);

  return (
    <Box className={`ai-expense-queue-item ai-expense-queue-item-${getSectionKey(item.status)}`}>
      <Stack spacing={1} sx={{ minWidth: 0, width: "100%" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", minWidth: 0 }}>
          {item.status === "ready" && (
            <Checkbox
              checked={isSelected}
              onChange={(event) => onToggleReadySelection(item.id, event.target.checked)}
              size="small"
              slotProps={{
                input: { "aria-label": `${item.title || secondaryLabel}を登録対象に含める` },
              }}
              sx={{ mt: -0.5 }}
            />
          )}
          {canPreview ? (
            <Button
              aria-label={`${secondaryLabel}の画像をプレビュー`}
              onClick={() => setPreviewOpen(true)}
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                flex: "0 0 auto",
                minWidth: 64,
                p: 0.5,
              }}
              type="button"
            >
              <Box
                alt={`${secondaryLabel}のレシート画像`}
                component="img"
                onError={() => setImageLoadFailed(true)}
                src={item.previewImageDataUrl}
                sx={{
                  borderRadius: 0.5,
                  display: "block",
                  height: 64,
                  objectFit: "cover",
                  width: 64,
                }}
              />
            </Button>
          ) : (
            <Button
              aria-label={`${secondaryLabel}の画像をプレビュー`}
              disabled
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                flex: "0 0 auto",
                minWidth: 64,
                p: 0.5,
              }}
              type="button"
            >
              <Stack spacing={0.25} sx={{ alignItems: "center", justifyContent: "center" }}>
                <ImageOutlinedIcon color="disabled" fontSize="small" />
                <Typography color="text.secondary" variant="caption">
                  画像なし
                </Typography>
              </Stack>
            </Button>
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              className="ai-expense-queue-item-title"
              sx={{ fontWeight: 700 }}
              title={item.title || secondaryLabel}
            >
              {item.title || secondaryLabel}
            </Typography>
            {item.title && (
              <Typography
                className="ai-expense-queue-item-secondary"
                color="text.secondary"
                title={secondaryLabel}
                variant="body2"
              >
                {secondaryLabel}
              </Typography>
            )}
          </Box>
        </Stack>

        {!canPreview && (
          <Typography color="text.secondary" variant="caption">
            このセッションでは画像を表示できません
          </Typography>
        )}

        {metadata && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {metadata}
            </Typography>
            <Chip label={documentTypeLabels[item.documentType]} size="small" variant="outlined" />
            {item.categoryName && (
              <Chip label={item.categoryName} size="small" variant="outlined" />
            )}
          </Stack>
        )}

        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <StatusChip status={item.status} />
          {item.registrationMode === "totalOnly" ? (
            <Chip label="合計だけで保存" size="small" variant="outlined" />
          ) : null}
          <ReviewReasonChips
            reasons={primaryReviewReason ? [primaryReviewReason] : []}
            status={item.status}
          />
          {reviewReasons.length > 1 && (
            <Chip label={`他${reviewReasons.length - 1}件`} size="small" variant="outlined" />
          )}
        </Stack>

        {item.status === "failed" && item.failureHint && (
          <Typography color="text.secondary" variant="body2">
            {item.failureHint}
          </Typography>
        )}

        {(item.status === "analyzing" || item.status === "registering") && (
          <LinearProgress
            aria-label={`${secondaryLabel}の処理状況`}
            sx={{ height: 4, borderRadius: 2 }}
          />
        )}

        <QueueItemActions
          isDeleting={isDeleting}
          isRegistering={isRegistering}
          item={item}
          onDelete={onDelete}
          onOpenReview={onOpenReview}
          onRegisterItem={onRegisterItem}
          onRetry={onRetry}
          onReanalyze={onReanalyze}
          onReturnToManualInput={onReturnToManualInput}
          isRetrying={isRetrying}
          canReanalyze={canPreview}
        />
      </Stack>

      <Dialog
        fullWidth
        maxWidth="md"
        onClose={() => setPreviewOpen(false)}
        open={previewOpen}
        aria-labelledby={`${item.id}-image-preview-title`}
      >
        <DialogTitle id={`${item.id}-image-preview-title`} sx={{ pr: 6 }}>
          {secondaryLabel}の画像プレビュー
        </DialogTitle>
        <IconButton
          aria-label="プレビューを閉じる"
          onClick={() => setPreviewOpen(false)}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent dividers sx={{ overscrollBehavior: "contain", textAlign: "center" }}>
          {canPreview ? (
            <Box
              alt={`${secondaryLabel}のレシート画像`}
              component="img"
              onError={() => setImageLoadFailed(true)}
              src={item.previewImageDataUrl}
              sx={{
                maxHeight: "70vh",
                maxWidth: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <Typography color="text.secondary">このセッションでは画像を表示できません</Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
