/**
 * webhook イベント claim の純粋な判定ロジック。
 * 永続化・スケジューリングはユースケース層がポート経由で行う。
 */
import type { LineWebhookEventInput } from "./payload";
import type { LineWebhookEventFields, LineImageJobFields } from "./records";

/** active リンクが一意のユーザーに解決できる場合だけその userId を返す。 */
export function resolveUniqueActiveUserId(
  activeLinks: Array<{ userId: string }>,
): string | undefined {
  const activeUserIds = new Set(activeLinks.map((link) => link.userId));
  return activeUserIds.size === 1 ? activeLinks[0]?.userId : undefined;
}

/** linked 配送のイベントレコード項目を組み立てる。 */
export function buildLinkedWebhookEventFields(
  event: LineWebhookEventInput,
  userId: string,
  now: number,
): LineWebhookEventFields {
  return {
    webhookEventId: event.webhookEventId,
    eventType: event.eventType,
    delivery: "linked",
    userId,
    ...(event.messageId === undefined ? {} : { messageId: event.messageId }),
    ...(event.messageText === undefined ? {} : { messageText: event.messageText }),
    ...(event.postbackData === undefined ? {} : { postbackData: event.postbackData }),
    ...(event.eventTimestamp === undefined ? {} : { eventTimestamp: event.eventTimestamp }),
    createdAt: now,
  };
}

/** unlinked 配送のイベントレコード項目を組み立てる。 */
export function buildUnlinkedWebhookEventFields(
  event: LineWebhookEventInput,
  now: number,
): LineWebhookEventFields {
  return {
    webhookEventId: event.webhookEventId,
    eventType: event.eventType,
    delivery: "unlinked",
    createdAt: now,
  };
}

/** pending の画像処理ジョブ項目を組み立てる。 */
export function buildPendingImageJobFields(
  webhookEventId: string,
  userId: string,
  messageId: string,
  now: number,
): LineImageJobFields {
  return {
    webhookEventId,
    userId,
    messageId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}
