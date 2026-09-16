import { v } from "convex/values";
import type { Infer } from "convex/values";

export const lineWebhookEventTypeValidator = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("postback"),
  v.literal("follow"),
  v.literal("unfollow"),
);

export const lineWebhookDeliveryValidator = v.union(v.literal("linked"), v.literal("unlinked"));

export const lineImageJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("drafted"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const lineImageSkipReasonValidator = v.union(
  v.literal("unlinked"),
  v.literal("no_consent"),
  v.literal("no_group"),
  v.literal("unresolved_group"),
  v.literal("fetch_failed"),
  v.literal("invalid_image"),
  v.literal("too_large"),
);

export type LineImageJobStatus = Infer<typeof lineImageJobStatusValidator>;
export type LineImageSkipReason = Infer<typeof lineImageSkipReasonValidator>;

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

export type {
  LineWebhookEventType,
  LineWebhookEventInput,
} from "../../lib/domain/lineWebhook/payload";

export {
  LineWebhookPayloadError,
  MAX_EVENTS_PER_REQUEST,
  parseLineWebhookPayload,
} from "../../lib/domain/lineWebhook/payload";
