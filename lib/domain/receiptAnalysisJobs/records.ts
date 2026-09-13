export type ReceiptAnalysisBatchStatus =
  | "queued"
  | "running"
  | "partially_failed"
  | "completed"
  | "failed";

export type ReceiptAnalysisJobStatus =
  | "queued"
  | "running"
  | "ready"
  | "needs_review"
  | "failed"
  | "cancelled";

export type ReceiptAnalysisBatchRecord = {
  id: string;
  creationTime: number;
  groupId: string;
  createdByUserId?: string;
  totalCount: number;
  processedCount: number;
  status: ReceiptAnalysisBatchStatus;
  aiReviewNotificationScheduledAt?: number;
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
