import type {
  EmailProviderError,
  EmailWebhookEventType,
  TransactionalEmailJobStatus,
  TransactionalEmailType,
} from "../../email/model";
import { getRetryDelayMs, isMaxAttemptsReached } from "../../email/retryPolicy";
import type { TransactionalEmailJobRecord } from "./records";

export const EMAIL_PROVIDER_NAME = "resend";

export const EMAIL_JOB_MAX_ATTEMPTS = 6;

export const TERMINAL_EMAIL_JOB_STATUSES = [
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
] as const satisfies readonly TransactionalEmailJobStatus[];

export type TerminalEmailJobStatus = (typeof TERMINAL_EMAIL_JOB_STATUSES)[number];

export function isTerminalEmailJobStatus(
  status: TransactionalEmailJobStatus,
): status is TerminalEmailJobStatus {
  return (TERMINAL_EMAIL_JOB_STATUSES as readonly TransactionalEmailJobStatus[]).includes(status);
}

export const EMAIL_CLEANUP_BATCH_SIZE = 100;
export const EMAIL_RETENTION_DAYS = 30;
export const EMAIL_RETENTION_MS = EMAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function emailCleanupCutoff(now: number): number {
  return now - EMAIL_RETENTION_MS;
}

export function shouldContinueEmailCleanup(
  deletedJobCount: number,
  deletedEventCount: number,
): boolean {
  return (
    deletedJobCount >= EMAIL_CLEANUP_BATCH_SIZE || deletedEventCount >= EMAIL_CLEANUP_BATCH_SIZE
  );
}

export type NewTransactionalEmailJobFields = Omit<
  TransactionalEmailJobRecord,
  "id" | "creationTime"
>;

export function buildNewEmailJobFields(args: {
  templateType: TransactionalEmailType;
  payloadJson: string;
  recipientEmail: string;
  normalizedRecipientEmail: string;
  subject: string;
  businessDedupeKey?: string;
  now: number;
}): NewTransactionalEmailJobFields {
  return {
    templateType: args.templateType,
    payloadJson: args.payloadJson,
    recipientEmail: args.recipientEmail,
    normalizedRecipientEmail: args.normalizedRecipientEmail,
    subject: args.subject,
    ...(args.businessDedupeKey ? { businessDedupeKey: args.businessDedupeKey } : {}),
    provider: EMAIL_PROVIDER_NAME,
    status: "queued",
    attemptCount: 0,
    maxAttempts: EMAIL_JOB_MAX_ATTEMPTS,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

export type SendFailurePlan =
  | { kind: "failed" }
  | { kind: "retry"; nextAttempt: number; nextRetryAt: number; delayMs: number };

export function planSendFailure(
  error: Pick<EmailProviderError, "retryable" | "message" | "code">,
  nextAttempt: number,
  now: number,
): SendFailurePlan {
  if (!error.retryable || isMaxAttemptsReached(nextAttempt)) {
    return { kind: "failed" };
  }
  const delay = getRetryDelayMs(nextAttempt);
  if (delay === null) {
    return { kind: "failed" };
  }
  return { kind: "retry", nextAttempt, nextRetryAt: now + delay, delayMs: delay };
}

export type ResendWebhookPayloadFields = {
  providerMessageId?: string;
  recipientEmail?: string;
  eventCreatedAt?: number;
};

export type ResendWebhookPayloadData = {
  email_id?: string;
  created_at?: string;
  to?: string[];
  from?: string;
  subject?: string;
  bounce?: { type?: string };
  complaint?: { type?: string };
  suppressed?: { type?: string };
  failed?: { reason?: string };
};

export function extractResendEventFields(
  data: ResendWebhookPayloadData,
): ResendWebhookPayloadFields {
  let eventCreatedAt: number | undefined;
  if (data.created_at) {
    const parsed = Date.parse(data.created_at);
    eventCreatedAt = Number.isNaN(parsed) ? undefined : parsed;
  }
  return {
    providerMessageId: data.email_id,
    recipientEmail: data.to?.[0],
    eventCreatedAt,
  };
}

export function isStaleWebhookEvent(
  latestEventCreatedAt: number | undefined,
  eventCreatedAt: number | undefined,
): boolean {
  return (
    latestEventCreatedAt !== undefined &&
    eventCreatedAt !== undefined &&
    latestEventCreatedAt > eventCreatedAt
  );
}

export const RESEND_WEBHOOK_EVENT_TYPES: readonly EmailWebhookEventType[] = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.failed",
  "email.suppressed",
];

export function isResendWebhookEventType(type: string): type is EmailWebhookEventType {
  return (RESEND_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}
