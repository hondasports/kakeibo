import type {
  ReceiptAnalysisBatchStatus,
  ReceiptAnalysisJobRecord,
  ReceiptAnalysisJobStatus,
} from "./records";
import { isTerminalImageJobStatus } from "./status";

import { AI_EXPENSE_DRAFT_LIST_LIMIT } from "../aiExpenseDrafts/constants";

export class ReceiptAnalysisJobDomainError extends Error {}

export const RECEIPT_ANALYSIS_RETRY_DRAFT_STATUSES = ["needs_review", "failed"] as const;
export const MAX_RECEIPT_ANALYSIS_DRAFT_IDS =
  AI_EXPENSE_DRAFT_LIST_LIMIT * RECEIPT_ANALYSIS_RETRY_DRAFT_STATUSES.length;

// 1回の画像解析バッチで受け付ける最大枚数。有料の解析呼び出し件数をサーバー側で制限する
export const MAX_RECEIPT_ANALYSIS_BATCH_FILES = 10;

export function canRetryReceiptAnalysisJob(status: ReceiptAnalysisJobStatus): boolean {
  return status === "failed" || status === "needs_review";
}

// 有料の画像解析を開始してよいのは queued のみ。retryImageJob が failed/needs_review を
// queued へ戻してから analyzeImageJob を呼ぶため、queued 以外の起動は常に拒否する。
export function canAnalyzeReceiptAnalysisJob(status: ReceiptAnalysisJobStatus): boolean {
  return status === "queued";
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
