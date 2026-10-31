export const RECEIPT_ANALYSIS_BATCH_STATUSES = [
  "queued",
  "running",
  "partially_failed",
  "completed",
  "failed",
] as const;
export type ReceiptAnalysisBatchStatus = (typeof RECEIPT_ANALYSIS_BATCH_STATUSES)[number];

export const RECEIPT_ANALYSIS_JOB_STATUSES = [
  "queued",
  "running",
  "ready",
  "needs_review",
  "failed",
  "cancelled",
] as const;
export type ReceiptAnalysisJobStatus = (typeof RECEIPT_ANALYSIS_JOB_STATUSES)[number];

export type ReceiptAnalysisBatchRecord = {
  id: string;
  creationTime: number;
  groupId: string;
  createdByUserId?: string;
  totalCount: number;
  processedCount: number;
  status: ReceiptAnalysisBatchStatus;
  aiReviewNotificationScheduledAt?: number;
  aiReviewLineNotificationConsumedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ReceiptAnalysisJobRecord = {
  id: string;
  creationTime: number;
  batchId: string;
  groupId: string;
  imageIndex: number;
  fileName: string;
  status: ReceiptAnalysisJobStatus;
  draftId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};
