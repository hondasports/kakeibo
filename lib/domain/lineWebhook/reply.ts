/**
 * LINE webhook 応答文の写像ルール（純粋関数）。
 */
import {
  LINE_IMAGE_CONSENT_REQUIRED_MESSAGE,
  LINE_IMAGE_FETCH_FAILED_MESSAGE,
  LINE_IMAGE_INVALID_MESSAGE,
  LINE_IMAGE_TOO_LARGE_MESSAGE,
  buildLineImageReviewUrl,
  formatLineImageAnalysisFailedReply,
  formatLineImageDraftCreatedReply,
} from "../lineImage/reply";
import { LINE_NO_GROUP_MESSAGE, LINE_UNRESOLVED_GROUP_MESSAGE } from "../lineSummary/reply";
import type { LineImageJobStatus, LineImageSkipReason } from "./records";

export const LINE_UNLINKED_GUIDANCE_MESSAGE =
  "LINE連携が必要です。kakeiboのWeb設定からLINE連携を完了してください。";

export function replyForImageSkipReason(reason: LineImageSkipReason): string {
  switch (reason) {
    case "unlinked":
      return LINE_UNLINKED_GUIDANCE_MESSAGE;
    case "no_consent":
      return LINE_IMAGE_CONSENT_REQUIRED_MESSAGE;
    case "no_group":
      return LINE_NO_GROUP_MESSAGE;
    case "unresolved_group":
      return LINE_UNRESOLVED_GROUP_MESSAGE;
    case "invalid_image":
      return LINE_IMAGE_INVALID_MESSAGE;
    case "too_large":
      return LINE_IMAGE_TOO_LARGE_MESSAGE;
    case "fetch_failed":
      return LINE_IMAGE_FETCH_FAILED_MESSAGE;
  }
}

export type LineImageJobSnapshot = {
  status: LineImageJobStatus;
  skipReason?: LineImageSkipReason;
  draftId?: string;
};

export function replyForCompletedImageJob(job: LineImageJobSnapshot): string {
  const reviewUrl = buildLineImageReviewUrl();
  if (job.status === "drafted") {
    return formatLineImageDraftCreatedReply(reviewUrl);
  }
  if (job.status === "failed") {
    return formatLineImageAnalysisFailedReply(reviewUrl);
  }
  if (job.status === "skipped" && job.skipReason) {
    return replyForImageSkipReason(job.skipReason);
  }
  return LINE_IMAGE_FETCH_FAILED_MESSAGE;
}
