import type { AiExpenseQueueItem } from "../../../types/aiExpenseQueue";

export type AiExpenseUploadBatch = {
  batchId: string;
  jobIds: string[];
  fileNames: string[];
};

export type AiExpenseQueueBatchSummary = AiExpenseUploadBatch & {
  totalCount: number;
  readyItems: AiExpenseQueueItem[];
  queuedCount: number;
  analyzingCount: number;
  processingCount: number;
  readyCount: number;
  needsReviewCount: number;
  failedCount: number;
  registeredCount: number;
  missingCount: number;
  isAllReady: boolean;
};
