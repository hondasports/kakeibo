import type { EmailSuppressionReason } from "../../email/model";
import type {
  EmailSuppressionRecord,
  EmailWebhookEventRecord,
  TransactionalEmailJobRecord,
} from "./records";
import type { NewTransactionalEmailJobFields, TerminalEmailJobStatus } from "./rules";

export interface TransactionalEmailJobReader {
  getJob(jobId: string): Promise<TransactionalEmailJobRecord | null>;
  findJobByBusinessDedupeKey(key: string): Promise<TransactionalEmailJobRecord | null>;
  findJobByProviderMessageId(
    providerMessageId: string,
  ): Promise<TransactionalEmailJobRecord | null>;
  listJobsByNormalizedRecipient(normalizedEmail: string): Promise<TransactionalEmailJobRecord[]>;
  listTerminalJobsUpdatedBefore(
    status: TerminalEmailJobStatus,
    cutoff: number,
    limit: number,
  ): Promise<TransactionalEmailJobRecord[]>;
}

export type MarkJobSentFields = {
  jobId: string;
  providerMessageId: string;
  status: "sent";
  html?: string;
  text?: string;
  updatedAt: number;
};

export type MarkJobRetryingFields = {
  jobId: string;
  status: "retrying";
  attemptCount: number;
  nextRetryAt: number;
  errorMessage?: string;
  errorCode?: string;
  updatedAt: number;
};

export type MarkJobTerminalFields = {
  jobId: string;
  status: "failed" | "suppressed";
  errorMessage?: string;
  errorCode?: string;
  updatedAt: number;
};

export type UpdateJobStatusFromWebhookFields = {
  jobId: string;
  status: TerminalEmailJobStatus;
  lastProviderEventAt: number;
  updatedAt: number;
};

export interface TransactionalEmailJobStore extends TransactionalEmailJobReader {
  insertJob(fields: NewTransactionalEmailJobFields): Promise<string>;
  markJobSent(fields: MarkJobSentFields): Promise<void>;
  markJobRetrying(fields: MarkJobRetryingFields): Promise<void>;
  markJobTerminal(fields: MarkJobTerminalFields): Promise<void>;
  updateJobStatusFromWebhook(fields: UpdateJobStatusFromWebhookFields): Promise<void>;
  deleteJob(id: string): Promise<void>;
}

export type UpsertEmailSuppressionArgs = {
  email: string;
  normalizedEmail: string;
  reason: EmailSuppressionReason;
  source?: string;
  providerMessageId?: string;
  createdAt: number;
};

export interface EmailSuppressionStore {
  findByNormalizedEmail(normalizedEmail: string): Promise<EmailSuppressionRecord | null>;
  listByNormalizedEmail(normalizedEmail: string): Promise<EmailSuppressionRecord[]>;
  insertSuppression(fields: Omit<EmailSuppressionRecord, "id" | "creationTime">): Promise<string>;
  updateSuppression(
    id: string,
    fields: {
      reason: EmailSuppressionReason;
      source?: string;
      providerMessageId?: string;
      updatedAt: number;
    },
  ): Promise<void>;
  deleteSuppression(id: string): Promise<void>;
}

export type NewEmailWebhookEventFields = Omit<EmailWebhookEventRecord, "id" | "creationTime">;

export interface EmailWebhookEventReader {
  findEventBySvixId(svixId: string): Promise<EmailWebhookEventRecord | null>;
  findLatestEventForProviderMessageId(
    providerMessageId: string,
  ): Promise<EmailWebhookEventRecord | null>;
  listEventsProcessedBefore(cutoff: number, limit: number): Promise<EmailWebhookEventRecord[]>;
  listEventsByProviderMessageId(providerMessageId: string): Promise<EmailWebhookEventRecord[]>;
}

export interface EmailWebhookEventStore extends EmailWebhookEventReader {
  insertEvent(fields: NewEmailWebhookEventFields): Promise<string>;
  deleteEvent(id: string): Promise<void>;
}

export interface EmailJobScheduler {
  scheduleProcessJob(delayMs: number, jobId: string): Promise<void>;
  scheduleCleanup(delayMs: number): Promise<void>;
}
