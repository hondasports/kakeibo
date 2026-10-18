/**
 * 未連携ガイド送信ユースケース。失敗時は attempt<2 まで 1秒後にリトライする。
 */
import { LINE_UNLINKED_GUIDANCE_MESSAGE } from "../../domain/lineWebhook/reply";
import type { LineActionScheduler, LineReplySender } from "../../domain/lineWebhook/actionRunner";
import { LINE_REPLY_RETRY_DELAY_MS, MAX_LINE_REPLY_RETRIES } from "./replyRetryPolicy";

export type SendUnlinkedGuideDeps = {
  replySender: LineReplySender;
  actionScheduler: LineActionScheduler;
};

export async function sendUnlinkedGuide(
  deps: SendUnlinkedGuideDeps,
  args: { replyToken: string; attempt?: number },
): Promise<null> {
  const attempt = args.attempt ?? 0;
  try {
    await deps.replySender.sendTextReply(args.replyToken, LINE_UNLINKED_GUIDANCE_MESSAGE);
  } catch {
    if (attempt < MAX_LINE_REPLY_RETRIES) {
      await deps.actionScheduler.scheduleUnlinkedGuideRetry(LINE_REPLY_RETRY_DELAY_MS, {
        replyToken: args.replyToken,
        attempt: attempt + 1,
      });
    }
  }
  return null;
}
