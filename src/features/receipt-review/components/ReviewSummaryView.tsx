import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { ReviewReasonChips } from "./ReviewReasonChips";
import { StatusChip } from "./StatusChip";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import { formatReviewDraftHeader, resolveReviewShopName } from "../utils/reviewDialogUtils";
import { deriveVisibleReviewReasons, getPrimaryReviewReason } from "../utils/reviewFeedback";
import { ReceiptTotalsPanel } from "./ReceiptTotalsPanel";
import { ReviewItemsReadOnly } from "./ReviewItemsReadOnly";

export function ReviewSummaryView({
  categories,
  selectedReviewDraft,
  reviewForm,
  reviewItems,
  itemsExpanded,
  onToggleItemsExpanded,
}: {
  categories: AiExpenseQueueCategory[];
  selectedReviewDraft: AiExpenseDraft | null;
  reviewForm: ReviewFormValues;
  reviewItems: ReviewItemValues[];
  itemsExpanded: boolean;
  onToggleItemsExpanded: () => void;
}) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const [prevDraftId, setPrevDraftId] = useState(selectedReviewDraft?._id);
  if (prevDraftId !== selectedReviewDraft?._id) {
    setPrevDraftId(selectedReviewDraft?._id);
    setExpandedItemId(null);
  }

  const shopName = resolveReviewShopName(
    reviewForm,
    selectedReviewDraft?.shopName ?? selectedReviewDraft?.payeeName,
  );
  const categoryName = categories.find((category) => category._id === reviewForm.categoryId)?.name;
  const reviewReasons = deriveVisibleReviewReasons(
    selectedReviewDraft?.reviewReasons ?? [],
    reviewItems,
    reviewForm.categoryId,
  );
  const primaryReviewReason = getPrimaryReviewReason(reviewReasons);

  return (
    <>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography component="h2" sx={{ fontWeight: 700 }} variant="h6">
            {shopName}
          </Typography>
          {selectedReviewDraft && <StatusChip status={selectedReviewDraft.status} />}
        </Stack>
        <Typography color="text.secondary" variant="body2">
          {formatReviewDraftHeader(reviewForm)}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          カテゴリ：レシート全体（{categoryName ?? "未分類"}）
        </Typography>
        <Typography color="text.secondary" variant="body2">
          明細：{reviewItems.length}件
        </Typography>
      </Box>

      <ReceiptTotalsPanel
        paidTotalYen={selectedReviewDraft?.amountYen}
        reviewItems={reviewItems}
        taxSummaries={selectedReviewDraft?.taxSummaries}
      />

      {primaryReviewReason && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <ReviewReasonChips
            reasons={[primaryReviewReason]}
            status={selectedReviewDraft?.status ?? "needs_review"}
          />
          {reviewReasons.length > 1 && (
            <Typography color="text.secondary" variant="body2">
              他{reviewReasons.length - 1}件
            </Typography>
          )}
        </Stack>
      )}

      <Button
        endIcon={itemsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={onToggleItemsExpanded}
        type="button"
        variant="text"
      >
        {itemsExpanded ? "明細を閉じる" : "明細を見る"}
      </Button>
      <Collapse in={itemsExpanded}>
        <ReviewItemsReadOnly
          categories={categories}
          draft={selectedReviewDraft}
          expandedItemId={expandedItemId}
          onToggleItemDetail={(itemId) =>
            setExpandedItemId(expandedItemId === itemId ? null : itemId)
          }
          reviewItems={reviewItems}
        />
      </Collapse>
    </>
  );
}
