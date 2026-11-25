import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getImageCaptureFailureHint } from "../../../../lib/domain/aiExpenseDrafts/failure";
import { getDraftTitle } from "../../../../lib/domain/aiExpenseDrafts/title";
import {
  isReviewableDraftStatus,
  type AiExpenseDraft,
  type AiExpenseDraftWithItems,
  type ReviewFormValues,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import type {
  AiExpenseQueueDraftSource,
  AiExpenseQueueItem,
  AiExpenseQueueStatus,
} from "../../../types/aiExpenseQueue";

export const emptyReviewForm: ReviewFormValues = {
  documentType: "receipt",
  shopName: "",
  date: "",
  amountYen: "",
  categoryId: "",
  registrationMode: "detailed",
};

export function mapDraftToQueueItem(
  draft: AiExpenseQueueDraftSource,
  statusOverrides: Partial<Record<string, AiExpenseQueueStatus>>,
  categories?: Array<{ _id: Id<"categories"> | string; name: string }>,
  previewImageDataUrl?: string,
): AiExpenseQueueItem {
  const categoryName = categories?.find((c) => c._id === draft.categoryId)?.name;
  const categoryAggregates = draft.itemSummary?.categoryAggregates.map((aggregate) => ({
    ...aggregate,
    categoryName: categories?.find((category) => category._id === aggregate.categoryId)?.name,
  }));
  return {
    id: draft._id,
    fileName: draft.imageFileName,
    previewImageDataUrl,
    failureHint: getImageCaptureFailureHint(draft.status, draft.warnings),
    warnings: draft.warnings,
    status: statusOverrides[draft._id] ?? draft.status,
    documentType: draft.documentType,
    title: getDraftTitle(draft),
    amountYen: draft.amountYen,
    date: draft.date,
    categoryName,
    reviewReasons: draft.reviewReasons,
    amountAndTaxResolved: draft.listSummary?.amountAndTaxResolved,
    itemTotalYen: draft.itemSummary?.itemTotalYen,
    itemDifferenceYen: draft.itemSummary?.itemDifferenceYen,
    hasUncategorizedItems: draft.itemSummary?.hasUncategorizedItems,
    hasLowConfidenceItems: draft.itemSummary?.hasLowConfidenceItems,
    categoryAggregates,
    registrationMode: draft.registrationMode,
  };
}

/**
 * 永続化ドキュメントをレビュー用 DTO へ変換する。
 * queued / analyzing の解析中 status はレビュー対象外なので null を返す。
 */
export function mapConvexDraftToAiExpenseDraft(
  draft: Doc<"aiExpenseDrafts">,
): AiExpenseDraft | null {
  const status = draft.status;
  if (!isReviewableDraftStatus(status)) {
    return null;
  }
  return {
    _id: draft._id,
    status,
    documentType: draft.documentType,
    imageFileName: draft.imageFileName,
    shopName: draft.shopName,
    paymentPlace: draft.paymentPlace,
    payeeName: draft.payeeName,
    paymentPurpose: draft.paymentPurpose,
    date: draft.date,
    amountYen: draft.amountYen,
    receiptTotalResolution: draft.receiptTotalResolution,
    receiptTaxDecision: draft.receiptTaxDecision,
    receiptDataContractVersion: draft.receiptDataContractVersion,
    rawObservation: draft.rawObservation,
    receiptInterpretation: draft.receiptInterpretation,
    receiptUserOverride: draft.receiptUserOverride,
    registrationMode: draft.registrationMode,
    derivedRegistration: draft.derivedRegistration,
    categoryId: draft.categoryId,
    reviewReasons: draft.reviewReasons,
    warnings: draft.warnings,
    taxSummaries: draft.taxSummaries,
    markerDefinitions: draft.markerDefinitions,
    listSummary: draft.listSummary,
  };
}

/**
 * getWithItems の戻り値をレビュー用 DTO へ変換する。
 * undefined（読み込み中）と null（不存在）はそのまま返し、
 * レビュー対象外の status は null に畳む。
 */
export function toReviewableDraftWithItems(
  value: { draft: Doc<"aiExpenseDrafts">; items: Doc<"aiExpenseDraftItems">[] } | null | undefined,
): AiExpenseDraftWithItems | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  const draft = mapConvexDraftToAiExpenseDraft(value.draft);
  if (draft === null) {
    return null;
  }
  return { draft, items: value.items };
}
