/**
 * action 層ユースケース用ランナーの Convex 実装。
 * ctx.runQuery/runMutation/scheduler・LINE 送信をポートへ適合させる。
 */
import type { ActionCtx } from "../../../convex/_generated/server";
import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { mapExtractionToDraftArgs } from "../../domain/aiExpenseDrafts/extractionMapping";
import { getSafeFailureWarning } from "../receiptImageExtraction/analyzeReceiptImageCore";
import { extractReceiptFieldsFromImage } from "../../../convex/receiptImageExtraction/extraction";
import type {
  LineActionScheduler,
  LineImageContextReader,
  LineImageDraftRunner,
  LineImageJobRunner,
  LineReplySender,
  LineSummaryRunner,
} from "../../domain/lineWebhook/actionRunner";
import { getLineMessageContent, sendLineTextReply } from "./lineMessagingClient";

const LINE_IMAGE_FILE_NAME = "line-receipt.jpg";

/** lineImageJobs の参照・遷移（内部 query/mutation 呼び出し）。 */
export function createLineImageJobRunner(ctx: ActionCtx): LineImageJobRunner {
  return {
    async getImageJob(webhookEventId) {
      const job = await ctx.runQuery(internal.lineWebhook.internal.getImageJob, {
        webhookEventId,
      });
      if (job === null) return null;
      return {
        webhookEventId: job.webhookEventId,
        userId: job.userId,
        messageId: job.messageId,
        status: job.status,
        ...(job.skipReason === undefined ? {} : { skipReason: job.skipReason }),
        ...(job.draftId === undefined ? {} : { draftId: job.draftId }),
      };
    },
    markImageJobSkipped: async (webhookEventId, skipReason) => {
      await ctx.runMutation(internal.lineWebhook.internal.markImageJobSkipped, {
        webhookEventId,
        skipReason,
      });
    },
    markImageJobDrafted: async (webhookEventId, draftId) => {
      await ctx.runMutation(internal.lineWebhook.internal.markImageJobDrafted, {
        webhookEventId,
        draftId: draftId as Id<"aiExpenseDrafts">,
      });
    },
    markImageJobFailed: async (webhookEventId, draftId) => {
      await ctx.runMutation(internal.lineWebhook.internal.markImageJobFailed, {
        webhookEventId,
        ...(draftId === undefined ? {} : { draftId: draftId as Id<"aiExpenseDrafts"> }),
      });
    },
  };
}

/** 画像処理コンテキストの読み込み（内部 query 呼び出し）。 */
export function createLineImageContextReader(ctx: ActionCtx): LineImageContextReader {
  return {
    async loadImageProcessingContext(userId) {
      const context = await ctx.runQuery(internal.lineWebhook.internal.loadImageProcessingContext, {
        userId,
      });
      return {
        hasUniqueActiveLink: context.hasUniqueActiveLink,
        hasConsent: context.hasConsent,
        groupStatus: context.groupStatus,
        ...(context.groupId === undefined ? {} : { groupId: context.groupId }),
        categories: context.categories.map((category) => ({
          id: category._id,
          name: category.name,
          ...(category.description === undefined ? {} : { description: category.description }),
        })),
      };
    },
  };
}

/** 画像→下書き生成（抽出 + aiExpenseDrafts 内部 mutation）。 */
export function createLineImageDraftRunner(ctx: ActionCtx): LineImageDraftRunner {
  return {
    async createDraftFromImage({ userId, imageDataUrl, categories }) {
      try {
        const extracted = await extractReceiptFieldsFromImage({
          imageDataUrl,
          categories: categories.map((category) => ({
            name: category.name,
            description: category.description,
          })),
        });
        const draftArgs = mapExtractionToDraftArgs(
          extracted,
          categories.map((category) => ({
            _id: category.id as Id<"categories">,
            name: category.name,
            ...(category.description === undefined ? {} : { description: category.description }),
          })),
          LINE_IMAGE_FILE_NAME,
        );
        const draft = await ctx.runMutation(
          internal.aiExpenseDrafts.internal.createFromExtractionForUser,
          { userId, ...draftArgs },
        );
        return { status: draft.status, draftId: draft._id };
      } catch (error) {
        const draft = await ctx.runMutation(
          internal.aiExpenseDrafts.internal.createFailedDraftFromImageAnalysisForUser,
          {
            userId,
            warning: getSafeFailureWarning(error),
            imageFileName: LINE_IMAGE_FILE_NAME,
          },
        );
        return { status: draft.status, draftId: draft._id };
      }
    },
  };
}

/** サマリ応答の組み立て（内部 query 呼び出し）。 */
export function createLineSummaryRunner(ctx: ActionCtx): LineSummaryRunner {
  return {
    buildReply: (args) => ctx.runQuery(internal.lineWebhook.summary.buildReply, args),
  };
}

/** LINE へのテキスト応答送信。 */
export function createLineReplySender(): LineReplySender {
  return {
    sendTextReply: (replyToken, text, quickReplyActions = []) =>
      sendLineTextReply(replyToken, text, fetch, quickReplyActions),
  };
}

/** action 側のリトライ予約。 */
export function createLineActionScheduler(ctx: ActionCtx): LineActionScheduler {
  return {
    scheduleUnlinkedGuideRetry: async (delayMs, args) => {
      await ctx.scheduler.runAfter(delayMs, internal.lineWebhook.actions.sendUnlinkedGuide, args);
    },
    scheduleSummaryReplyRetry: async (delayMs, args) => {
      await ctx.scheduler.runAfter(delayMs, internal.lineWebhook.actions.sendSummaryReply, args);
    },
    scheduleProcessLinkedImageRetry: async (delayMs, args) => {
      await ctx.scheduler.runAfter(delayMs, internal.lineWebhook.image.processLinkedImage, args);
    },
  };
}

export { getLineMessageContent };
