import type { TransactionalEmailType } from "../../email/model";
import type { NotificationChannel } from "./model";

export type NotificationSettingRecord = {
  id: string;
  type: TransactionalEmailType;
  channel: NotificationChannel;
  enabled: boolean;
  updatedByUserId: string;
  updatedAt: number;
};

export const LINE_NOTIFICATION_JOB_STATUSES = [
  "queued",
  "processing",
  "retrying",
  "sent",
  "suppressed",
  "failed",
] as const;

export type LineNotificationJobStatus = (typeof LINE_NOTIFICATION_JOB_STATUSES)[number];

export const TERMINAL_LINE_NOTIFICATION_JOB_STATUSES = [
  "sent",
  "suppressed",
  "failed",
] as const satisfies readonly LineNotificationJobStatus[];

export type TerminalLineNotificationJobStatus =
  (typeof TERMINAL_LINE_NOTIFICATION_JOB_STATUSES)[number];

export function isTerminalLineNotificationJobStatus(
  status: LineNotificationJobStatus,
): status is TerminalLineNotificationJobStatus {
  return (TERMINAL_LINE_NOTIFICATION_JOB_STATUSES as readonly LineNotificationJobStatus[]).includes(
    status,
  );
}

export type LineNotificationJobRecord = {
  id: string;
  creationTime?: number;
  userId: string;
  batchId: string;
  type: "ai_review_required";
  pendingCount: number;
  linkId: string;
  linkedAtSnapshot: number;
  lineUserIdSnapshot: string;
  text: string;
  status: LineNotificationJobStatus;
  attemptCount: number;
  retryKey?: string;
  leaseUntil?: number;
  firstAttemptAt?: number;
  nextRetryAt?: number;
  providerRequestId?: string;
  errorCode?: string;
  createdAt: number;
  updatedAt: number;
};

export type NewLineNotificationJobFields = Omit<LineNotificationJobRecord, "id" | "creationTime">;

export const LINE_NOTIFICATION_EVENT_OUTCOMES = ["queued", "skipped"] as const;
export type LineNotificationEventOutcome = (typeof LINE_NOTIFICATION_EVENT_OUTCOMES)[number];

export type LineNotificationEventRecord = {
  id: string;
  userId: string;
  batchId: string;
  type: "ai_review_required";
  dedupeKey: string;
  outcome: LineNotificationEventOutcome;
  reason?: string;
  createdAt: number;
  updatedAt: number;
};

export type NewLineNotificationEventFields = Omit<LineNotificationEventRecord, "id">;
