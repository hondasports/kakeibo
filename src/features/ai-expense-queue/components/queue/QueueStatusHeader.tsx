import { Button, Chip, Stack } from "@mui/material";
import type { AiExpenseQueueItem } from "../../types/types";
import { displayStatusLabels } from "../../../receipt-review/components/labels";

type QueueStatusHeaderProps = {
  groupedItems: {
    processing: AiExpenseQueueItem[];
    ready: AiExpenseQueueItem[];
    needs_review: AiExpenseQueueItem[];
    failed: AiExpenseQueueItem[];
    registered: AiExpenseQueueItem[];
  };
  firstReviewItem?: AiExpenseQueueItem;
  onOpenReview: (itemId: string) => void;
};

export function QueueStatusHeader({
  groupedItems,
  firstReviewItem,
  onOpenReview,
}: QueueStatusHeaderProps) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: "stretch" }}>
      <Stack
        className="ai-expense-queue-status-summary"
        direction="row"
        spacing={1}
        sx={{ flex: 1, flexWrap: "wrap", minWidth: 0, width: "100%" }}
      >
        {(
          [
            ["processing", groupedItems.processing.length, "default", true],
            ["needs_review", groupedItems.needs_review.length, "warning", false],
            ["ready", groupedItems.ready.length, "success", false],
            ["failed", groupedItems.failed.length, "error", false],
          ] as const
        )
          .filter(([, count]) => count > 0)
          .map(([status, count, color, outlined]) => (
            <Chip
              color={color}
              key={status}
              label={`${displayStatusLabels[status]} ${count}件`}
              size="small"
              variant={outlined ? "outlined" : "filled"}
            />
          ))}
      </Stack>
      {firstReviewItem && (
        <Button
          aria-label={`確認する（${groupedItems.needs_review.length}件）`}
          onClick={() => onOpenReview(firstReviewItem.id)}
          type="button"
          variant="outlined"
          sx={{ alignSelf: { xs: "stretch", md: "flex-start" } }}
        >
          確認する（{groupedItems.needs_review.length}件）
        </Button>
      )}
    </Stack>
  );
}
