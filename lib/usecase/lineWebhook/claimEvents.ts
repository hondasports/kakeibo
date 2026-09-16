/**
 * webhook イベントの claim/dedupe/delivery 振り分けユースケース。
 * claim と案内・画像ジョブ予約を同一 mutation 内で行い、LINE再送時の取りこぼしを防ぐ。
 */
import { ConvexError } from "convex/values";
import { resolveLineEventCommandText } from "../../domain/lineSummary/commands";
import {
  buildLinkedWebhookEventFields,
  buildPendingImageJobFields,
  buildUnlinkedWebhookEventFields,
  resolveUniqueActiveUserId,
} from "../../domain/lineWebhook/claimPlanning";
import { MAX_EVENTS_PER_REQUEST } from "../../domain/lineWebhook/payload";
import type { LineWebhookEventInput } from "../../domain/lineWebhook/payload";
import type { LineAccountLinkReader } from "../../domain/lineWebhook/accountLinkReader";
import type { LineWebhookScheduler } from "../../domain/lineWebhook/scheduler";
import type { LineImageJobStore } from "../../domain/lineWebhook/imageJobStore";
import type { LineWebhookEventStore } from "../../domain/lineWebhook/webhookEventStore";

export type ClaimEventsDeps = {
  webhookEvents: LineWebhookEventStore;
  imageJobs: LineImageJobStore;
  accountLinks: LineAccountLinkReader;
  scheduler: LineWebhookScheduler;
};

export type ClaimEventsResult = {
  claimedCount: number;
  duplicateCount: number;
  scheduledGuideCount: number;
  scheduledSummaryCount: number;
  scheduledImageCount: number;
};

export async function claimEvents(
  deps: ClaimEventsDeps,
  events: LineWebhookEventInput[],
): Promise<ClaimEventsResult> {
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    throw new ConvexError("Too many LINE webhook events");
  }

  let claimedCount = 0;
  let duplicateCount = 0;
  let scheduledGuideCount = 0;
  let scheduledSummaryCount = 0;
  let scheduledImageCount = 0;
  const seenEventIds = new Set<string>();

  for (const event of events) {
    if (seenEventIds.has(event.webhookEventId)) {
      duplicateCount += 1;
      continue;
    }
    seenEventIds.add(event.webhookEventId);

    // 既存データに重複があってもWebhook再送処理自体は継続できるようfirstを使う。
    const duplicate = await deps.webhookEvents.findByWebhookEventId(event.webhookEventId);
    if (duplicate) {
      duplicateCount += 1;
      continue;
    }

    const activeLinks = await deps.accountLinks.listActiveByLineUserId(event.lineUserId, 2);
    const activeUserId = resolveUniqueActiveUserId(activeLinks);
    const now = Date.now();

    if (activeUserId) {
      await deps.webhookEvents.insert(buildLinkedWebhookEventFields(event, activeUserId, now));
      const commandText = resolveLineEventCommandText(event);
      if (commandText !== undefined && event.replyToken) {
        await deps.scheduler.scheduleSummaryReply({
          replyToken: event.replyToken,
          userId: activeUserId,
          messageText: commandText,
          nowMs: event.eventTimestamp ?? now,
        });
        scheduledSummaryCount += 1;
      }
      if (event.eventType === "image" && event.messageId) {
        await deps.imageJobs.insert(
          buildPendingImageJobFields(event.webhookEventId, activeUserId, event.messageId, now),
        );
        await deps.scheduler.scheduleProcessLinkedImage({
          replyToken: event.replyToken ?? "",
          userId: activeUserId,
          webhookEventId: event.webhookEventId,
          messageId: event.messageId,
        });
        scheduledImageCount += 1;
      }
    } else {
      await deps.webhookEvents.insert(buildUnlinkedWebhookEventFields(event, now));
      if (event.replyToken) {
        // claimと予約を同じmutationで行う。予約に失敗した場合はinsertも
        // ロールバックされ、LINE再送時に案内を取りこぼさない。
        await deps.scheduler.scheduleUnlinkedGuide({ replyToken: event.replyToken });
        scheduledGuideCount += 1;
      }
    }
    claimedCount += 1;
  }

  return {
    claimedCount,
    duplicateCount,
    scheduledGuideCount,
    scheduledSummaryCount,
    scheduledImageCount,
  };
}
