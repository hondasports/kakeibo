/**
 * 連携済み画像メッセージの処理ユースケース。
 * ジョブ確認→コンテキスト判定→コンテンツ取得→下書き生成→応答文返却の順序はベースと同一。
 * 失敗時は attempt<2 まで 1秒後にリトライし、上限超過時は failed へ遷移させる。
 */
import { LineImageContentTooLargeError, toImageDataUrl } from "../../domain/lineImage/content";
import {
  LINE_IMAGE_FETCH_FAILED_MESSAGE,
  buildLineImageReviewUrl,
  formatLineImageAnalysisFailedReply,
  formatLineImageDraftCreatedReply,
} from "../../domain/lineImage/reply";
import { replyForCompletedImageJob, replyForImageSkipReason } from "../../domain/lineWebhook/reply";
import type { LineImageSkipReason } from "../../domain/lineWebhook/records";
import type {
  LineActionScheduler,
  LineImageContentReader,
  LineImageContextReader,
  LineImageDraftRunner,
  LineImageJobRunner,
  LineReplySender,
  ProcessLinkedImageRetryArgs,
} from "../../domain/lineWebhook/actionRunner";

const IMAGE_RETRY_DELAY_MS = 1_000;
const MAX_IMAGE_RETRIES = 2;

export type ProcessLinkedImageDeps = {
  imageJobs: LineImageJobRunner;
  imageContext: LineImageContextReader;
  drafts: LineImageDraftRunner;
  contentReader: LineImageContentReader;
  replySender: LineReplySender;
  actionScheduler: LineActionScheduler;
};

export type ProcessLinkedImageArgs = {
  replyToken: string;
  userId: string;
  webhookEventId: string;
  messageId: string;
  attempt?: number;
};

async function skipJob(
  deps: ProcessLinkedImageDeps,
  webhookEventId: string,
  skipReason: LineImageSkipReason,
): Promise<string> {
  await deps.imageJobs.markImageJobSkipped(webhookEventId, skipReason);
  return replyForImageSkipReason(skipReason);
}

export async function buildLinkedImageReply(
  deps: ProcessLinkedImageDeps,
  args: ProcessLinkedImageArgs,
): Promise<string> {
  const job = await deps.imageJobs.getImageJob(args.webhookEventId);
  if (job === null) {
    return LINE_IMAGE_FETCH_FAILED_MESSAGE;
  }
  if (job.status !== "pending") {
    return replyForCompletedImageJob(job);
  }

  const context = await deps.imageContext.loadImageProcessingContext(job.userId);
  if (!context.hasUniqueActiveLink) {
    return await skipJob(deps, args.webhookEventId, "unlinked");
  }
  if (!context.hasConsent) {
    return await skipJob(deps, args.webhookEventId, "no_consent");
  }
  if (context.groupStatus === "no_group") {
    return await skipJob(deps, args.webhookEventId, "no_group");
  }
  if (context.groupStatus !== "resolved" || context.groupId === undefined) {
    return await skipJob(deps, args.webhookEventId, "unresolved_group");
  }

  let content;
  try {
    content = await deps.contentReader.getMessageContent(job.messageId);
  } catch (error) {
    if (error instanceof LineImageContentTooLargeError) {
      return await skipJob(deps, args.webhookEventId, "too_large");
    }
    return await skipJob(deps, args.webhookEventId, "fetch_failed");
  }

  const dataUrl = toImageDataUrl(content);
  if (!dataUrl.ok) {
    return await skipJob(
      deps,
      args.webhookEventId,
      dataUrl.error === "too_large" ? "too_large" : "invalid_image",
    );
  }

  const draft = await deps.drafts.createDraftFromImage({
    userId: job.userId,
    imageDataUrl: dataUrl.dataUrl,
    categories: context.categories,
  });
  if (draft.status === "failed") {
    await deps.imageJobs.markImageJobFailed(args.webhookEventId, draft.draftId);
    return formatLineImageAnalysisFailedReply(buildLineImageReviewUrl());
  }

  await deps.imageJobs.markImageJobDrafted(args.webhookEventId, draft.draftId);
  return formatLineImageDraftCreatedReply(buildLineImageReviewUrl());
}

export async function processLinkedImage(
  deps: ProcessLinkedImageDeps,
  args: ProcessLinkedImageArgs,
): Promise<null> {
  const attempt = args.attempt ?? 0;
  try {
    const replyText = await buildLinkedImageReply(deps, args);
    if (args.replyToken) {
      await deps.replySender.sendTextReply(args.replyToken, replyText);
    }
  } catch {
    if (attempt < MAX_IMAGE_RETRIES) {
      const retryArgs: ProcessLinkedImageRetryArgs = {
        replyToken: args.replyToken,
        userId: args.userId,
        webhookEventId: args.webhookEventId,
        messageId: args.messageId,
        attempt: attempt + 1,
      };
      await deps.actionScheduler.scheduleProcessLinkedImageRetry(IMAGE_RETRY_DELAY_MS, retryArgs);
      return null;
    }
    console.error("LINE image processing failed", {
      webhookEventId: args.webhookEventId,
      attempt,
    });
    await deps.imageJobs.markImageJobFailed(args.webhookEventId);
  }
  return null;
}
