/**
 * webhook イベントの claim/dedupe/delivery 振り分けユースケース。
 * claim と案内・画像ジョブ予約を同一 mutation 内で行い、LINE再送時の取りこぼしを防ぐ。
 */
import { ConvexError } from "convex/values";
import {
  parseLineSummaryCommand,
  resolveCategoryLookup,
  resolveLineEventCommandText,
} from "../../domain/lineSummary/commands";
import { parseLineExpenseInput } from "../../domain/lineExpenseInput/lineExpenseInput";
import { MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import { getTodayDateStringInJapan } from "../../domain/common/date";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import type { LineActiveGroupResolver } from "../../domain/lineWebhook/activeGroupResolver";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { LineSummaryDataReader } from "../../domain/lineWebhook/summaryDataReader";
import type { LineExpenseDraftStore } from "../../domain/lineWebhook/lineExpenseDraftStore";
import {
  buildLinkedWebhookEventFields,
  buildPendingImageJobFields,
  buildUnlinkedWebhookEventFields,
  resolveUniqueActiveUserId,
} from "../../domain/lineWebhook/claimPlanning";
import { MAX_EVENTS_PER_REQUEST } from "../../domain/lineWebhook/payload";
import type { LineWebhookEventInput } from "../../domain/lineWebhook/payload";
import type { LineAccountLinkReader } from "../../domain/lineLink/accountLinkStore";
import type { LineWebhookScheduler } from "../../domain/lineWebhook/scheduler";
import type { LineImageJobStore } from "../../domain/lineWebhook/imageJobStore";
import type { LineWebhookEventStore } from "../../domain/lineWebhook/webhookEventStore";

export type ClaimEventsDeps = {
  webhookEvents: LineWebhookEventStore;
  imageJobs: LineImageJobStore;
  accountLinks: LineAccountLinkReader;
  scheduler: LineWebhookScheduler;
  activeGroup: LineActiveGroupResolver;
  groups: GroupReadRepository;
  summaryData: LineSummaryDataReader;
  expenseDrafts: LineExpenseDraftStore;
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
    const activeLink = activeLinks[0];
    const now = Date.now();

    if (activeUserId && activeLink) {
      await deps.webhookEvents.insert(buildLinkedWebhookEventFields(event, activeUserId, now));
      const commandText = resolveLineEventCommandText(event);
      if (commandText !== undefined && event.replyToken) {
        await deps.scheduler.scheduleSummaryReply({
          replyToken: event.replyToken,
          userId: activeUserId,
          linkId: activeLink.id,
          lineUserId: event.lineUserId,
          messageText: commandText,
          nowMs: event.eventTimestamp ?? now,
        });
        scheduledSummaryCount += 1;
        // 「内容＋金額」のテキストは支出下書きをclaimと同じmutationで作成する。
        // webhookEventId dedupによりLINE再送での二重作成は起きない。
        await maybeCreateExpenseDraft(
          deps,
          commandText,
          activeUserId,
          event.eventTimestamp ?? now,
          now,
        );
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

/**
 * 「内容＋金額」のテキストを下書き化する（カテゴリ名＋金額も含む）。
 * グループ解決・削除済みチェックは buildSummaryReply と同じ手順に揃える。
 */
async function maybeCreateExpenseDraft(
  deps: ClaimEventsDeps,
  commandText: string,
  activeUserId: string,
  eventAtMs: number,
  now: number,
): Promise<void> {
  const command = parseLineSummaryCommand(commandText);
  // help 分類（日本語を含まない入力等）も支出入力の可能性があるため対象にする。
  // 「使い方」等の実コマンドは parseLineExpenseInput が金額不在で弾く。
  if (
    command.type !== "week_summary" &&
    command.type !== "category_lookup" &&
    command.type !== "help"
  ) {
    return;
  }
  const expenseInput = parseLineExpenseInput(commandText);
  if (expenseInput === null) return;

  const groupResolution = await deps.activeGroup.resolve(activeUserId);
  if (groupResolution.status !== "resolved") return;
  const group = await deps.groups.get(groupResolution.groupId);
  if (group === null || isGroupDeleted(group)) return;

  const categories = await deps.summaryData.listActiveCategories(
    groupResolution.groupId,
    MAX_CATEGORIES_PER_GROUP,
  );
  // 「食費 1,200円」のようなカテゴリ名＋金額も支出入力を優先する。
  // カテゴリは金額を取り除いた title だけで解決し、金額を含まない入力は
  // そもそも parseLineExpenseInput が弾くため従来どおり category_lookup に流れる。
  const category = resolveCategoryLookup(expenseInput.title, categories);
  await deps.expenseDrafts.createFromLineText({
    groupId: groupResolution.groupId,
    createdByUserId: activeUserId,
    title: expenseInput.title,
    amountYen: expenseInput.amountYen,
    categoryId: category?.id,
    date: getTodayDateStringInJapan(eventAtMs),
    now,
  });
}
