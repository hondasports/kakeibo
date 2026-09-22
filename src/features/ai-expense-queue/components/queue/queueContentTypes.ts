import type { useAiExpenseQueuePanel } from "../../hooks/useAiExpenseQueuePanel";
import type { AiExpenseQueueItem } from "../../../../types/aiExpenseQueue";
import type { AiExpenseQueueBatchSummary } from "../../types/types";

export type QueueContentProps = {
  clearableCount: number;
  deletingIds: string[];
  groupedItems: ReturnType<typeof useAiExpenseQueuePanel>["groupedItems"];
  itemCount: number;
  readyItems: AiExpenseQueueItem[];
  sessionBatchSummaries: AiExpenseQueueBatchSummary[];
  unbatchedReadyItems: AiExpenseQueueItem[];
  registeringIds: string[];
  registrationError: string;
  selectedReadyIds: string[];
  onClearOpenQueue: () => Promise<void>;
  onDeleteQueueItem: ReturnType<typeof useAiExpenseQueuePanel>["deleteQueueItem"];
  onOpenReview: (itemId: string) => void;
  onRegisterReady: (itemIds?: string[]) => Promise<void>;
  onRetry: (draftId: string) => Promise<void>;
  onReanalyze?: (draftId: string) => Promise<void>;
  retryingItemId?: string | null;
  onToggleReadySelection: (itemId: string, checked: boolean) => void;
};

export type QueueRegisteredContentProps = Pick<
  QueueContentProps,
  | "deletingIds"
  | "groupedItems"
  | "registeringIds"
  | "selectedReadyIds"
  | "onOpenReview"
  | "onRegisterReady"
  | "onToggleReadySelection"
>;
