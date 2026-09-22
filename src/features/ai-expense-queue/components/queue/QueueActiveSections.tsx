import type { AiExpenseQueueItem } from "../../../../types/aiExpenseQueue";
import { QueueSection } from "./QueueSection";

type QueueActiveSectionsProps = {
  groupedItems: {
    processing: AiExpenseQueueItem[];
    ready: AiExpenseQueueItem[];
    needs_review: AiExpenseQueueItem[];
    failed: AiExpenseQueueItem[];
    registered: AiExpenseQueueItem[];
  };
  prioritizedReviewItems: AiExpenseQueueItem[];
  selectedReadyIds: string[];
  deletingIds: string[];
  registeringIds: string[];
  onOpenReview: (itemId: string) => void;
  onRegisterReady: (itemIds?: string[]) => Promise<void>;
  onDeleteQueueItem: (item: AiExpenseQueueItem) => Promise<void>;
  onRetry: (draftId: string) => Promise<void>;
  onReanalyze: (draftId: string) => Promise<void>;
  retryingItemId: string | null;
  onToggleReadySelection: (itemId: string, checked: boolean) => void;
};

export function QueueActiveSections({
  groupedItems,
  prioritizedReviewItems,
  selectedReadyIds,
  deletingIds,
  registeringIds,
  onOpenReview,
  onRegisterReady,
  onDeleteQueueItem,
  onRetry,
  onReanalyze,
  retryingItemId,
  onToggleReadySelection,
}: QueueActiveSectionsProps) {
  return (
    <>
      <QueueSection
        sectionKey="processing"
        items={groupedItems.processing}
        selectedReadyIds={selectedReadyIds}
        onOpenReview={onOpenReview}
        onRegisterItem={(itemId) => void onRegisterReady([itemId])}
        onDelete={(item) => void onDeleteQueueItem(item)}
        onReturnToManualInput={(item) => void onDeleteQueueItem(item)}
        onToggleReadySelection={onToggleReadySelection}
        deletingIds={deletingIds}
        registeringIds={registeringIds}
      />
      <QueueSection
        sectionKey="ready"
        items={groupedItems.ready}
        selectedReadyIds={selectedReadyIds}
        onOpenReview={onOpenReview}
        onRegisterItem={(itemId) => void onRegisterReady([itemId])}
        onDelete={(item) => void onDeleteQueueItem(item)}
        onReturnToManualInput={(item) => void onDeleteQueueItem(item)}
        onToggleReadySelection={onToggleReadySelection}
        deletingIds={deletingIds}
        registeringIds={registeringIds}
      />
      <QueueSection
        sectionKey="needs_review"
        items={prioritizedReviewItems}
        selectedReadyIds={selectedReadyIds}
        onOpenReview={onOpenReview}
        onRegisterItem={(itemId) => void onRegisterReady([itemId])}
        onDelete={(item) => void onDeleteQueueItem(item)}
        onReanalyze={onReanalyze}
        onReturnToManualInput={(item) => void onDeleteQueueItem(item)}
        onToggleReadySelection={onToggleReadySelection}
        deletingIds={deletingIds}
        registeringIds={registeringIds}
        retryingItemId={retryingItemId}
      />
      <QueueSection
        sectionKey="failed"
        items={groupedItems.failed}
        selectedReadyIds={selectedReadyIds}
        onOpenReview={onOpenReview}
        onRegisterItem={(itemId) => void onRegisterReady([itemId])}
        onDelete={(item) => void onDeleteQueueItem(item)}
        onRetry={onRetry}
        onReanalyze={onReanalyze}
        retryingItemId={retryingItemId}
        onReturnToManualInput={(item) => void onDeleteQueueItem(item)}
        onToggleReadySelection={onToggleReadySelection}
        deletingIds={deletingIds}
        registeringIds={registeringIds}
      />
    </>
  );
}
