/**
 * サマリ応答送信ユースケース。
 * query失敗時は LINE_SUMMARY_UNAVAILABLE_MESSAGE へフォールバックし、
 * 送信失敗時は attempt<2 まで 1秒後にリトライする。
 */
import { LINE_SUMMARY_UNAVAILABLE_MESSAGE } from "../../domain/lineSummary/reply";
import {
  LINE_WEB_APP_PATH,
  buildLineQuickReplyActions,
  type LineReplyKind,
} from "../../domain/lineSummary/quickReply";
import { buildEmailUrl } from "../../email/url";
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
  try {
    const result = await deps.summary.buildReply({
      userId: args.userId,
      messageText: args.messageText,
      nowMs: args.nowMs,
    });
    replyText = result.replyText;
    replyKind = result.replyKind ?? "unavailable";
  } catch {
    console.error("LINE summary query failed");
    replyText = LINE_SUMMARY_UNAVAILABLE_MESSAGE;
    replyKind = "unavailable";
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
        replyToken: args.replyToken,
        userId: args.userId,
        messageText: args.messageText,
        nowMs: args.nowMs,
        attempt: attempt + 1,
      });
    }
  }
  return null;
}
