import type { ReceiptAnalysisJobStatus } from "./records";

const TERMINAL_IMAGE_JOB_STATUSES = [
  "ready",
  "needs_review",
  "failed",
  "cancelled",
] as const satisfies readonly ReceiptAnalysisJobStatus[];

export type TerminalImageJobStatus = (typeof TERMINAL_IMAGE_JOB_STATUSES)[number];

/** 解析試行が下書きへ書き込む結果 status（cancelled は対象外）。 */
export const DRAFT_RESULT_IMAGE_JOB_STATUSES = [
  "ready",
  "needs_review",
  "failed",
] as const satisfies readonly ReceiptAnalysisJobStatus[];

export type DraftResultImageJobStatus = (typeof DRAFT_RESULT_IMAGE_JOB_STATUSES)[number];

export function isTerminalImageJobStatus(status: string): boolean {
  return (TERMINAL_IMAGE_JOB_STATUSES as readonly ReceiptAnalysisJobStatus[]).includes(
    status as ReceiptAnalysisJobStatus,
  );
}
