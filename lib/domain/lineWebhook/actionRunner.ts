/**
 * action 層ユースケースが必要とする実行ポート群（domain interface）。
 * Convex action は db へ直接アクセスできないため、内部 query/mutation の呼び出し・
 * LINE API 送信・リトライ予約をすべてポートとして抽象化する。
 * 実装は infrastructure 層（lib/convex）が ctx.runQuery/runMutation/scheduler で提供する。
 */
import type { LineQuickReplyAction } from "../lineSummary/quickReply";
import type { LineReplyKind } from "../lineSummary/quickReply";
import type { LineImageSkipReason, LineImageJobStatus } from "./records";
import type { LineCategoryHint } from "./summaryDataReader";
import type { SummaryReplyJobArgs } from "./scheduler";

/** getImageJob の応答形状（ドメイン側）。 */
export type LineImageJobView = {
  webhookEventId: string;
  userId: string;
  messageId: string;
  status: LineImageJobStatus;
  skipReason?: LineImageSkipReason;
  draftId?: string;
};

/** loadImageProcessingContext の応答形状（ドメイン側）。 */
export type LineImageProcessingContext = {
  hasUniqueActiveLink: boolean;
  hasConsent: boolean;
  groupStatus: "resolved" | "no_group" | "unresolved";
  groupId?: string;
  categories: LineCategoryHint[];
};

/** 画像ジョブの参照・遷移（内部 query/mutation 相当）。 */
export interface LineImageJobRunner {
  getImageJob(webhookEventId: string): Promise<LineImageJobView | null>;
  markImageJobSkipped(webhookEventId: string, skipReason: LineImageSkipReason): Promise<void>;
  markImageJobDrafted(webhookEventId: string, draftId: string): Promise<void>;
  markImageJobFailed(webhookEventId: string, draftId?: string): Promise<void>;
}

/** 画像処理コンテキストの読み込み（内部 query 相当）。 */
export interface LineImageContextReader {
  loadImageProcessingContext(userId: string): Promise<LineImageProcessingContext>;
}

/** 画像から下書き生成まで（抽出+永続化の内部 mutation 相当）。 */
export type LineImageDraftResult = { status: string; draftId: string };

export interface LineImageDraftRunner {
  createDraftFromImage(input: {
    userId: string;
    imageDataUrl: string;
    categories: LineCategoryHint[];
  }): Promise<LineImageDraftResult>;
}

/** LINE のメッセージコンテンツ取得。 */
export type LineImageContent = { bytes: Uint8Array; contentType: string };

export interface LineImageContentReader {
  getMessageContent(messageId: string): Promise<LineImageContent>;
}

/** LINE へのテキスト応答送信。 */
export interface LineReplySender {
  sendTextReply(
    replyToken: string,
    text: string,
    quickReplyActions?: LineQuickReplyAction[],
  ): Promise<void>;
}

/** サマリ応答の組み立て（内部 query 相当）。 */
export interface LineSummaryRunner {
  buildReply(args: {
    userId: string;
    messageText: string;
    nowMs: number;
  }): Promise<{ replyText: string; replyKind: LineReplyKind }>;
}

export type SendUnlinkedGuideJobArgs = { replyToken: string; attempt?: number };

export type SendSummaryReplyJobArgs = SummaryReplyJobArgs & { attempt?: number };

export type ProcessLinkedImageRetryArgs = {
  replyToken: string;
  userId: string;
  webhookEventId: string;
  messageId: string;
  attempt?: number;
};

/** action 側リトライ予約。 */
export interface LineActionScheduler {
  scheduleUnlinkedGuideRetry(delayMs: number, args: SendUnlinkedGuideJobArgs): Promise<void>;
  scheduleSummaryReplyRetry(delayMs: number, args: SendSummaryReplyJobArgs): Promise<void>;
  scheduleProcessLinkedImageRetry(
    delayMs: number,
    args: ProcessLinkedImageRetryArgs,
  ): Promise<void>;
}
