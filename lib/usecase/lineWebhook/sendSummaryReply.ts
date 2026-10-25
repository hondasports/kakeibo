/**
 * サマリ応答送信ユースケース。
 * 旧形式ジョブとquery失敗時は金額を含まない固定文を返し、
 * 送信失敗時は attempt<2 まで 1秒後にリトライする。
 */
import {
  LINE_WEB_APP_PATH,
  buildLineQuickReplyActions,
  type LineReplyKind,
} from "../../domain/lineSummary/quickReply";
import { buildEmailUrl } from "../../email/url";
import { LINE_SUMMARY_UNAVAILABLE_MESSAGE } from "../../domain/lineSummary/reply";
import type {
  LineActionScheduler,
  LineReplySender,
  LineSummaryRunner,
  SendSummaryReplyJobArgs,
} from "../../domain/lineWebhook/actionRunner";
import { LINE_REPLY_RETRY_DELAY_MS, MAX_LINE_REPLY_RETRIES } from "./replyRetryPolicy";

export type SendSummaryReplyDeps = {
  replySender: LineReplySender;
  summary: LineSummaryRunner;
  actionScheduler: LineActionScheduler;
};

export async function sendSummaryReply(
  deps: SendSummaryReplyDeps,
  args: SendSummaryReplyJobArgs,
): Promise<null> {
  const attempt = args.attempt ?? 0;
  let replyText = LINE_SUMMARY_UNAVAILABLE_MESSAGE;
  let replyKind: LineReplyKind = "unavailable";
  if (args.linkId !== undefined && args.lineUserId !== undefined) {
    try {
      const result = await deps.summary.buildReply({
        userId: args.userId,
        linkId: args.linkId,
        lineUserId: args.lineUserId,
        messageText: args.messageText,
        nowMs: args.nowMs,
      });
      replyText = result.replyText;
      replyKind = result.replyKind ?? "unavailable";
    } catch {
      console.error("LINE summary query failed");
    }
  }

  try {
    const quickReplyActions = buildLineQuickReplyActions(
      replyKind,
      buildEmailUrl(LINE_WEB_APP_PATH),
    );
    await deps.replySender.sendTextReply(args.replyToken, replyText, quickReplyActions);
  } catch {
    if (attempt < MAX_LINE_REPLY_RETRIES) {
      await deps.actionScheduler.scheduleSummaryReplyRetry(LINE_REPLY_RETRY_DELAY_MS, {
        ...args,
        attempt: attempt + 1,
      });
    }
  }
  return null;
}
