import {
  getQueueContentSummary as getQueueContentSummaryDomain,
  getReviewPriority,
} from "../../../../lib/domain/aiExpenseDrafts/queue";
import type { AiExpenseQueueItem } from "../../../types/aiExpenseQueue";

export function reviewPriority(item: AiExpenseQueueItem): number {
  return getReviewPriority(item);
}

export function getQueueContentSummary({
  groupedItems,
  readyItems,
  selectedReadyIds,
}: {
  groupedItems: {
    processing: AiExpenseQueueItem[];
    ready: AiExpenseQueueItem[];
    needs_review: AiExpenseQueueItem[];
    failed: AiExpenseQueueItem[];
    registered: AiExpenseQueueItem[];
  };
  readyItems: AiExpenseQueueItem[];
  selectedReadyIds: string[];
}) {
  return getQueueContentSummaryDomain({
    groupedItems,
    readyItems,
    selectedReadyIds,
  });
}
