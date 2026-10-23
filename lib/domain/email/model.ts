export const TRANSACTIONAL_EMAIL_TYPES = [
  "email_delivery_test",
  "group_membership_removed",
  "group_role_changed",
  "group_ownership_received",
  "group_ownership_transferred",
  "group_deletion_started",
  "group_deletion_failed",
  "group_deleted",
  "ai_review_required",
  "account_deletion_completed",
] as const;

export type TransactionalEmailType = (typeof TRANSACTIONAL_EMAIL_TYPES)[number];

export const TRANSACTIONAL_EMAIL_JOB_STATUSES = [
  "queued",
  "processing",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
  "retrying",
] as const;

export type TransactionalEmailJobStatus = (typeof TRANSACTIONAL_EMAIL_JOB_STATUSES)[number];

export const EMAIL_SUPPRESSION_REASONS = ["bounce", "complaint", "provider_suppressed"] as const;

export type EmailSuppressionReason = (typeof EMAIL_SUPPRESSION_REASONS)[number];

export const EMAIL_WEBHOOK_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.failed",
  "email.suppressed",
] as const;

export type EmailWebhookEventType = (typeof EMAIL_WEBHOOK_EVENT_TYPES)[number];
