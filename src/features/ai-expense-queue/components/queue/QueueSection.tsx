import { useState } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import {
  queueSectionDescriptions,
  queueSectionLabels,
} from "../../../receipt-review/components/labels";
import type { AiExpenseQueueItem, QueueSectionKey } from "../../../../types/aiExpenseQueue";
import { QueueItemCard } from "./QueueItemCard";

export function QueueSection({
  sectionKey,
  items,
  selectedReadyIds,
  onToggleReadySelection,
  onOpenReview,
  onRegisterItem,
  onRetry,
  onReanalyze,
  retryingItemId,
  onDelete,
  onReturnToManualInput,
  deletingIds,
  registeringIds,
}: {
  sectionKey: QueueSectionKey;
  items: AiExpenseQueueItem[];
  selectedReadyIds: string[];
  onToggleReadySelection: (itemId: string, checked: boolean) => void;
  onOpenReview: (itemId: string) => void;
  onRegisterItem: (itemId: string) => void;
  onRetry?: (itemId: string) => void;
  onReanalyze?: (itemId: string) => void;
  retryingItemId?: string | null;
  onDelete?: (item: AiExpenseQueueItem) => void;
  onReturnToManualInput?: (item: AiExpenseQueueItem) => void;
  deletingIds: string[];
  registeringIds: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) {
    return null;
  }

  const label = queueSectionLabels[sectionKey];
  const description = queueSectionDescriptions[sectionKey];
  const isCollapsible = sectionKey === "needs_review" || sectionKey === "registered";
  const visibleItems = isCollapsible && !expanded ? items.slice(0, 3) : items;
  const remainingCount = items.length - visibleItems.length;

  return (
    <Box aria-label={label} className={`queue-section queue-section-${sectionKey}`} role="region">
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
            {label}
          </Typography>
          <Chip label={`${items.length}件`} size="small" variant="outlined" />
        </Stack>
        {description && (
          <Typography color="text.secondary" variant="body2">
            {description}
          </Typography>
        )}
        <Stack spacing={1}>
          {visibleItems.map((item) => (
            <QueueItemCard
              isSelected={selectedReadyIds.includes(item.id)}
              item={item}
              isDeleting={deletingIds.includes(item.id)}
              isRegistering={registeringIds.includes(item.id)}
              key={item.id}
              onDelete={onDelete}
              onOpenReview={onOpenReview}
              onRegisterItem={onRegisterItem}
              onRetry={onRetry}
              onReanalyze={onReanalyze}
              isRetrying={retryingItemId === item.id}
              onReturnToManualInput={onReturnToManualInput}
              onToggleReadySelection={onToggleReadySelection}
            />
          ))}
        </Stack>
        {remainingCount > 0 && (
          <Button onClick={() => setExpanded(true)} type="button" variant="text">
            {sectionKey === "needs_review"
              ? `残り${remainingCount}件を確認`
              : `残り${remainingCount}件を見る`}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
