import {
  TRANSACTIONAL_EMAIL_TYPES,
  TRANSACTIONAL_EMAIL_JOB_STATUSES,
  EMAIL_SUPPRESSION_REASONS,
  EMAIL_WEBHOOK_EVENT_TYPES,
} from "../../lib/domain/email/model";
export {
  TRANSACTIONAL_EMAIL_TYPES,
  TRANSACTIONAL_EMAIL_JOB_STATUSES,
  EMAIL_SUPPRESSION_REASONS,
  EMAIL_WEBHOOK_EVENT_TYPES,
} from "../../lib/domain/email/model";
import { v } from "convex/values";

export const transactionalEmailTypeValidator = v.union(
  ...TRANSACTIONAL_EMAIL_TYPES.map((t) => v.literal(t)),
);

export const transactionalEmailJobStatusValidator = v.union(
  ...TRANSACTIONAL_EMAIL_JOB_STATUSES.map((s) => v.literal(s)),
);

export const emailSuppressionReasonValidator = v.union(
  ...EMAIL_SUPPRESSION_REASONS.map((r) => v.literal(r)),
);

export const emailWebhookEventTypeValidator = v.union(
  ...EMAIL_WEBHOOK_EVENT_TYPES.map((t) => v.literal(t)),
);
