/**
 * lineWebhook ドメインのレコード型。
 * Convex ドキュメントIDは string、document メタデータは含まない。
 */
import type { LineWebhookEventType } from "./payload";

export type LineWebhookDelivery = "linked" | "unlinked";

export type LineWebhookEventFields = {
  webhookEventId: string;
  eventType: LineWebhookEventType;
  delivery: LineWebhookDelivery;
  userId?: string;
  messageId?: string;
  messageText?: string;
  postbackData?: string;
  eventTimestamp?: number;
  createdAt: number;
};

export type LineWebhookEventRecord = LineWebhookEventFields & { id: string };

export type LineImageJobStatus = "pending" | "drafted" | "failed" | "skipped";

export type LineImageSkipReason =
  | "unlinked"
  | "no_consent"
  | "no_group"
  | "unresolved_group"
  | "fetch_failed"
  | "invalid_image"
  | "too_large";

export type LineImageJobFields = {
  webhookEventId: string;
  userId: string;
  messageId: string;
  status: LineImageJobStatus;
  skipReason?: LineImageSkipReason;
  /** aiExpenseDrafts のドキュメントID。 */
  draftId?: string;
  createdAt: number;
  updatedAt: number;
};

export type LineImageJobRecord = LineImageJobFields & { id: string };

export type LineAccountLinkRecord = {
  id: string;
  userId: string;
  lineUserId: string;
  status: "active" | "revoked";
};
