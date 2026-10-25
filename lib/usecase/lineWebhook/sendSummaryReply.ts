/**
 * サマリ応答送信ユースケース。
 * リンクを確認できない場合は送信せず、
 * 送信失敗時は attempt<2 まで 1秒後にリトライする。
 */
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
  if (args.linkId === undefined || args.lineUserId === undefined) return null;

  const attempt = args.attempt ?? 0;
  let replyText: string;
  let replyKind: LineReplyKind;
  try {
    const result = await deps.summary.buildReply({
      userId: args.userId,
      linkId: args.linkId,
      lineUserId: args.lineUserId,
      messageText: args.messageText,
      nowMs: args.nowMs,
    });
    if (result === null) return null;
    replyText = result.replyText;
    replyKind = result.replyKind ?? "unavailable";
  } catch {
    console.error("LINE summary query failed");
    return null;
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
        linkId: args.linkId,
        lineUserId: args.lineUserId,
        messageText: args.messageText,
        nowMs: args.nowMs,
        attempt: attempt + 1,
      });
    }
  }
  return null;
}
