import type { ReceiptAnalysisJobStatus } from "./records";

export const TERMINAL_IMAGE_JOB_STATUSES = [
  "ready",
  "needs_review",
  "failed",
  "cancelled",
] as const satisfies readonly ReceiptAnalysisJobStatus[];

export type TerminalImageJobStatus = (typeof TERMINAL_IMAGE_JOB_STATUSES)[number];

export function isTerminalImageJobStatus(status: string): boolean {
  return (TERMINAL_IMAGE_JOB_STATUSES as readonly ReceiptAnalysisJobStatus[]).includes(
    status as ReceiptAnalysisJobStatus,
  );
}
