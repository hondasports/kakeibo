import type {
  ReceiptAnalysisBatchStatus,
  ReceiptAnalysisJobRecord,
  ReceiptAnalysisJobStatus,
} from "./records";
import { isTerminalImageJobStatus } from "./status";

export function canRetryReceiptAnalysisJob(status: ReceiptAnalysisJobStatus): boolean {
  return status === "failed" || status === "needs_review";
}

export function canCancelReceiptAnalysisJob(status: ReceiptAnalysisJobStatus): boolean {
  return status !== "ready" && status !== "needs_review";
}

export function clampReceiptAnalysisCleanupLimit(limit = 25): number {
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

export function resolveReceiptAnalysisBatchStatus(
  processedCount: number,
  totalCount: number,
  jobs: ReceiptAnalysisJobRecord[],
): ReceiptAnalysisBatchStatus | undefined {
  if (processedCount < totalCount) return undefined;
  if (jobs.some((job) => job.status === "running" || job.status === "queued")) return undefined;
  return jobs.some((job) => job.status === "failed") ? "partially_failed" : "completed";
}

export function shouldScheduleAiReviewNotification(
  status: string,
  alreadyScheduled: boolean,
): boolean {
  return isTerminalImageJobStatus(status) && !alreadyScheduled;
}
