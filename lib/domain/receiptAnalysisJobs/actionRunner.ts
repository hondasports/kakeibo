import type { ReceiptAnalysisJobRecord } from "./records";

export type AnalysisDraftResult = {
  id: string;
  status: "ready" | "needs_review" | "failed";
  updatedAt: number;
  warnings?: string[];
};

export interface ReceiptAnalysisActionRunner {
  assertConsent(): Promise<void>;
  getMyGroup(): Promise<{ id: string } | null>;
  getJob(jobId: string): Promise<ReceiptAnalysisJobRecord>;
  startAttempt(
    jobId: string,
    expectedDraftId: string | null,
  ): Promise<{ applied: boolean } | undefined>;
  waitForMockExtractor(): Promise<void>;
  loadPreservedUserOverride(
    draftId: string,
    groupId: string,
  ): Promise<{ draftUpdatedAt: number; value: unknown } | null>;
  analyzeImage(args: {
    imageDataUrl: string;
    imageFileName: string;
    telemetryId: string;
    preservedUserOverride?: unknown;
  }): Promise<AnalysisDraftResult>;
  createFailureDraft(
    telemetryId: string,
    imageFileName: string,
    error: unknown,
  ): Promise<AnalysisDraftResult>;
  finalizeAttempt(args: {
    jobId: string;
    expectedDraftId: string | null;
    expectedDraftUpdatedAt?: number;
    newDraftId: string;
    status: "ready" | "needs_review" | "failed";
    error?: string;
  }): Promise<{ applied: boolean } | undefined>;
  incrementBatchProcessedCount(batchId: string): Promise<void>;
  finalizeBatchStatus(batchId: string): Promise<void>;
  getBatch(batchId: string): Promise<{ createdByUserId?: string } | null>;
  countNeedsReviewJobs(batchId: string): Promise<number>;
  getUserEmail(userId: string): Promise<string | null>;
  enqueueAiReviewRequiredEmail(email: string, pendingCount: number): Promise<void>;
}
