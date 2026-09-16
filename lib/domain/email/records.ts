import type {
  EmailSuppressionReason,
  EmailWebhookEventType,
  TransactionalEmailJobStatus,
  TransactionalEmailType,
} from "../../email/model";

export type TransactionalEmailJobRecord = {
  id: string;
  creationTime?: number;
  templateType: TransactionalEmailType;
  payloadJson: string;
  recipientEmail: string;
  normalizedRecipientEmail: string;
  subject: string;
  businessDedupeKey?: string;
  html?: string;
  text?: string;
  provider: string;
  status: TransactionalEmailJobStatus;
  providerMessageId?: string;
  lastProviderEventAt?: number;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: number;
  errorMessage?: string;
  errorCode?: string;
  createdAt: number;
  updatedAt: number;
};

export type EmailSuppressionRecord = {
  id: string;
  creationTime?: number;
  email: string;
  normalizedEmail: string;
  reason: EmailSuppressionReason;
  source?: string;
  providerMessageId?: string;
  createdAt: number;
  updatedAt: number;
};

export type EmailWebhookEventRecord = {
  id: string;
  creationTime?: number;
  svixId: string;
  provider: string;
  eventType: EmailWebhookEventType;
  providerMessageId?: string;
  recipientEmail?: string;
  payloadJson: string;
  eventCreatedAt?: number;
  processedAt: number;
  createdAt: number;
};
