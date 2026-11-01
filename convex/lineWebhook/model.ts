import { v } from "convex/values";
import { LINE_WEBHOOK_EVENT_TYPES } from "../../lib/domain/lineWebhook/payload";
import {
  LINE_IMAGE_JOB_STATUSES,
  LINE_IMAGE_SKIP_REASONS,
  LINE_WEBHOOK_DELIVERIES,
} from "../../lib/domain/lineWebhook/records";

export const lineWebhookEventTypeValidator = v.union(
  ...LINE_WEBHOOK_EVENT_TYPES.map((value) => v.literal(value)),
);

export const lineWebhookDeliveryValidator = v.union(
  ...LINE_WEBHOOK_DELIVERIES.map((value) => v.literal(value)),
);

export const lineImageJobStatusValidator = v.union(
  ...LINE_IMAGE_JOB_STATUSES.map((value) => v.literal(value)),
);

export const lineImageSkipReasonValidator = v.union(
  ...LINE_IMAGE_SKIP_REASONS.map((value) => v.literal(value)),
);

export const lineWebhookEventInputValidator = v.object({
  webhookEventId: v.string(),
  eventType: lineWebhookEventTypeValidator,
  lineUserId: v.string(),
  replyToken: v.optional(v.string()),
  messageId: v.optional(v.string()),
  messageText: v.optional(v.string()),
  postbackData: v.optional(v.string()),
  eventTimestamp: v.optional(v.number()),
});

export type { LineImageJobStatus, LineImageSkipReason } from "../../lib/domain/lineWebhook/records";

export type {
  LineWebhookEventType,
  LineWebhookEventInput,
} from "../../lib/domain/lineWebhook/payload";

export {
  LineWebhookPayloadError,
  MAX_EVENTS_PER_REQUEST,
  parseLineWebhookPayload,
} from "../../lib/domain/lineWebhook/payload";
