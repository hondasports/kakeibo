/**
 * lineWebhook ドメインのレコード型。
 * Convex ドキュメントIDは string、document メタデータは含まない。
 */
import type { LineLinkStatus } from "../lineLink/records";
import type { LineWebhookEventType } from "./payload";

/** webhook イベントの連携状態別配送区分の全値。 */
export const LINE_WEBHOOK_DELIVERIES = ["linked", "unlinked"] as const;

/** webhook イベントの連携状態別配送区分。 */
export type LineWebhookDelivery = (typeof LINE_WEBHOOK_DELIVERIES)[number];

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

/** LINE 画像ジョブの状態の全値。 */
export const LINE_IMAGE_JOB_STATUSES = ["pending", "drafted", "failed", "skipped"] as const;

/** LINE 画像ジョブの状態。 */
export type LineImageJobStatus = (typeof LINE_IMAGE_JOB_STATUSES)[number];

/** LINE 画像ジョブのスキップ理由の全値。 */
export const LINE_IMAGE_SKIP_REASONS = [
  "unlinked",
  "no_consent",
  "no_group",
  "unresolved_group",
  "fetch_failed",
  "invalid_image",
  "too_large",
] as const;

/** LINE 画像ジョブのスキップ理由。 */
export type LineImageSkipReason = (typeof LINE_IMAGE_SKIP_REASONS)[number];

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
  status: LineLinkStatus;
};
