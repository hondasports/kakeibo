import type {
  ReceiptAnalysisBatchRecord,
  ReceiptAnalysisBatchStatus,
  ReceiptAnalysisJobRecord,
  ReceiptAnalysisJobStatus,
} from "./records";

export interface ReceiptAnalysisReader {
  getBatch(id: string): Promise<ReceiptAnalysisBatchRecord | null>;
  listBatchesByGroup(groupId: string, limit: number): Promise<ReceiptAnalysisBatchRecord[]>;
  getJob(id: string): Promise<ReceiptAnalysisJobRecord | null>;
  listJobsByBatch(batchId: string, limit?: number): Promise<ReceiptAnalysisJobRecord[]>;
  listJobsByGroup(groupId: string, limit: number): Promise<ReceiptAnalysisJobRecord[]>;
  findJobByDraftId(draftId: string): Promise<ReceiptAnalysisJobRecord | null>;
  countJobsByStatus(batchId: string, status: ReceiptAnalysisJobStatus): Promise<number>;
}

export interface ReceiptAnalysisStore extends ReceiptAnalysisReader {
  insertBatch(fields: Omit<ReceiptAnalysisBatchRecord, "id" | "creationTime">): Promise<string>;
  patchBatch(
    id: string,
    fields: Partial<Omit<ReceiptAnalysisBatchRecord, "id" | "creationTime">>,
  ): Promise<void>;
  takeBatchesByGroupAndUser(
    groupId: string,
    userId: string,
    limit: number,
  ): Promise<ReceiptAnalysisBatchRecord[]>;
  deleteBatch(id: string): Promise<void>;
  insertJob(fields: Omit<ReceiptAnalysisJobRecord, "id" | "creationTime">): Promise<string>;
  patchJob(
    id: string,
    fields: {
      status?: ReceiptAnalysisJobStatus;
      draftId?: string;
      error?: string;
      updatedAt: number;
    },
  ): Promise<void>;
  clearJobFields(
    id: string,
    fields: {
      status: ReceiptAnalysisJobStatus;
      draftId?: string;
      error?: string;
      clearDraftId?: boolean;
      clearError?: boolean;
      updatedAt: number;
    },
  ): Promise<void>;
  deleteJob(id: string): Promise<void>;
  getDraft(id: string): Promise<{ id: string; status: string; updatedAt: number } | null>;
  deleteDraftAndItems(draftId: string, groupId: string): Promise<void>;
}

export interface ReceiptAnalysisScheduler {
  scheduleAiReviewCheck(delayMs: number, batchId: string): Promise<void>;
}

export type UpdateJobFields = {
  status: ReceiptAnalysisJobStatus;
  draftId?: string;
  error?: string;
};

export type BatchStatus = ReceiptAnalysisBatchStatus;
