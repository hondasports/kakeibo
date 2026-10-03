import { buildEmailUrl } from "../../email/url";
import {
  DEFAULT_MAX_RETRY_ATTEMPTS,
  calculateRetryDelayMs,
  isMaxRetryAttemptsReached,
} from "../common/retry";
import { isTerminalLineNotificationJobStatus, type LineNotificationJobRecord } from "./records";

export const LINE_NOTIFICATION_LEASE_MS = 30 * 1000;
export const LINE_NOTIFICATION_PROVIDER_TIMEOUT_MS = 10 * 1000;
export const LINE_RETRY_KEY_TTL_MS = 24 * 60 * 60 * 1000;
export const LINE_NOTIFICATION_CLEANUP_BATCH_SIZE = 100;
export const LINE_NOTIFICATION_STALE_JOB_MS = 60 * 1000;
export const LINE_NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRetryKey(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isLineNotificationJobDue(
  job: Pick<LineNotificationJobRecord, "status" | "nextRetryAt" | "leaseUntil">,
  now: number,
): boolean {
  if (isTerminalLineNotificationJobStatus(job.status)) return false;
  if (job.status === "queued") return true;
  if (job.status === "retrying") return (job.nextRetryAt ?? 0) <= now;
  return (job.leaseUntil ?? 0) <= now;
}

export function isLineNotificationJobAlive(
  job: Pick<LineNotificationJobRecord, "status">,
): boolean {
  return !isTerminalLineNotificationJobStatus(job.status);
}

export type LineNotificationRetryPlan =
  | { kind: "retry"; nextRetryAt: number; delayMs: number }
  | { kind: "exhausted"; errorCode: string };

export function planLineNotificationRetry(args: {
  attemptCount: number;
  firstAttemptAt: number;
  now: number;
}): LineNotificationRetryPlan {
  if (isMaxRetryAttemptsReached(args.attemptCount)) {
    return { kind: "exhausted", errorCode: "max_attempts_reached" };
  }
  const delayMs = calculateRetryDelayMs(args.attemptCount);
  if (delayMs === null) {
    return { kind: "exhausted", errorCode: "max_attempts_reached" };
  }
  const retryKeyDeadline = args.firstAttemptAt + LINE_RETRY_KEY_TTL_MS;
  const nextRetryAt = args.now + delayMs;
  if (nextRetryAt >= retryKeyDeadline) {
    return { kind: "exhausted", errorCode: "retry_key_expired" };
  }
  return { kind: "retry", nextRetryAt, delayMs };
}

export function getLineNotificationExhaustionErrorCode(
  job: Pick<LineNotificationJobRecord, "attemptCount" | "firstAttemptAt">,
  now: number,
): "max_attempts_reached" | "retry_key_expired" | null {
  if (job.attemptCount >= DEFAULT_MAX_RETRY_ATTEMPTS) {
    return "max_attempts_reached";
  }
  if (job.firstAttemptAt !== undefined && now >= job.firstAttemptAt + LINE_RETRY_KEY_TTL_MS) {
    return "retry_key_expired";
  }
  return null;
}

export function buildAiReviewEmailDedupeKey(batchId: string): string {
  return `ai-review-required/${batchId}`;
}

export function buildAiReviewLineDedupeKey(batchId: string): string {
  return `ai-review-required-line/${batchId}`;
}

export function buildAiReviewLineText(pendingCount: number): string {
  return [
    `確認が必要なレシートが${pendingCount}件あります。`,
    `確認する: ${buildEmailUrl("/weeks/current/input")}`,
    `通知設定を変更: ${buildEmailUrl("/settings#notifications")}`,
  ].join("\n");
}
