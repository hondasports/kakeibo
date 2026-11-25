import type { ReceiptAnalysisJobRecord } from "./records";
import type { DraftResultImageJobStatus } from "./status";

type AnalysisDraftResult = {
  id: string;
  status: DraftResultImageJobStatus;
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
  ): Promise<{ applied: boolean; denialReason?: "daily_limit" } | undefined>;
  waitForMockExtractor(): Promise<void>;
  loadPreservedUserOverride(
    draftId: string,
    groupId: string,
  ): Promise<{ draftUpdatedAt: number; value: unknown } | null>;
  analyzeImage(args: {
    groupId: string;
    imageDataUrl: string;
    imageFileName: string;
    telemetryId: string;
    preservedUserOverride?: unknown;
  }): Promise<AnalysisDraftResult>;
  createFailureDraft(
    telemetryId: string,
    imageFileName: string,
    error: unknown,
    groupId: string,
  ): Promise<AnalysisDraftResult>;
  finalizeAttempt(args: {
    jobId: string;
    groupId: string;
    expectedDraftId: string | null;
    expectedDraftUpdatedAt?: number;
    newDraftId: string;
    status: DraftResultImageJobStatus;
    error?: string;
  }): Promise<{ applied: boolean } | undefined>;
  recomputeBatchProgress(batchId: string): Promise<void>;
  getBatch(batchId: string): Promise<{ createdByUserId?: string } | null>;
  enqueueAiReviewRequiredNotifications(args: { batchId: string; userId: string }): Promise<void>;
}
