/**
 * lineWebhook スケジューラのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が ctx.scheduler で提供する。
 * mutation 側（claim/cleanup）の予約のみを対象とし、action 側のリトライ予約は
 * actionRunner.ts の LineActionScheduler を使う。
 */

export type SummaryReplyJobArgs = {
  replyToken: string;
  userId: string;
  messageText: string;
  nowMs: number;
};

export type ProcessLinkedImageJobArgs = {
  replyToken: string;
  userId: string;
  webhookEventId: string;
  messageId: string;
};

export interface LineWebhookScheduler {
  /** サマリ応答アクションを即時予約する。 */
  scheduleSummaryReply(args: SummaryReplyJobArgs): Promise<void>;
  /** 未連携ガイドアクションを即時予約する。 */
  scheduleUnlinkedGuide(args: { replyToken: string }): Promise<void>;
  /** 画像処理アクションを即時予約する。 */
  scheduleProcessLinkedImage(args: ProcessLinkedImageJobArgs): Promise<void>;
  /** cleanup の次バッチを即時予約する。 */
  scheduleCleanup(): Promise<void>;
}
