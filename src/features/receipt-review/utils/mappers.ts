import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getImageCaptureFailureHint } from "../../../../lib/domain/aiExpenseDrafts/failure";
import { getDraftTitle } from "../../../../lib/domain/aiExpenseDrafts/title";
import { dropResolvedAmountTaxReasons } from "../../../../lib/domain/aiExpenseDrafts/reviewFeedback";
import type {
  AiExpenseDraft,
  AiExpenseDraftStatus,
  AiExpenseDraftWithItems,
  ReviewFormValues,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import type { AiExpenseQueueItem, AiExpenseQueueStatus } from "../../../types/aiExpenseQueue";

export const emptyReviewForm: ReviewFormValues = {
  documentType: "receipt",
  shopName: "",
  date: "",
  amountYen: "",
  categoryId: "",
  registrationMode: "detailed",
};

export function mapDraftToQueueItem(
  draft: AiExpenseDraft,
  statusOverrides: Partial<Record<string, AiExpenseQueueStatus>>,
  categories?: Array<{ _id: Id<"categories"> | string; name: string }>,
  previewImageDataUrl?: string,
): AiExpenseQueueItem {
  // 保存済みサマリの判定を使う。無い下書きは未解決として扱う（一覧は明細を持たないため再判定しない）。
  const amountAndTaxResolved = draft.listSummary?.amountAndTaxResolved ?? false;
  const categoryName = categories?.find((c) => c._id === draft.categoryId)?.name;
  const categoryAggregates = draft.itemSummary?.categoryAggregates.map((aggregate) => ({
    ...aggregate,
    categoryName: categories?.find((category) => category._id === aggregate.categoryId)?.name,
  }));
  return {
    id: draft._id,
    fileName: draft.imageFileName ?? "AI支出下書き",
    previewImageDataUrl,
    failureHint: getImageCaptureFailureHint(draft.status as AiExpenseDraftStatus, draft.warnings),
    warnings: draft.warnings,
    status: statusOverrides[draft._id] ?? draft.status,
    documentType: draft.documentType,
    title: getDraftTitle(draft),
    amountYen: draft.amountYen,
    date: draft.date,
    categoryName,
    reviewReasons: dropResolvedAmountTaxReasons(draft.reviewReasons, amountAndTaxResolved),
    itemTotalYen: draft.itemSummary?.itemTotalYen,
    // 解決済みなら保存時の合計との差は残さない（確認の優先度を不要に上げない）。
    itemDifferenceYen:
      amountAndTaxResolved && draft.itemSummary?.itemDifferenceYen !== undefined
        ? 0
        : draft.itemSummary?.itemDifferenceYen,
    hasUncategorizedItems: draft.itemSummary?.hasUncategorizedItems,
    hasLowConfidenceItems: draft.itemSummary?.hasLowConfidenceItems,
    categoryAggregates,
    registrationMode: draft.registrationMode,
  };
}

export function mapConvexDraftToAiExpenseDraft(draft: Doc<"aiExpenseDrafts">): AiExpenseDraft {
  return {
    _id: draft._id,
    status: draft.status as AiExpenseDraftStatus,
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

export function isDraftWithItems(value: unknown): value is AiExpenseDraftWithItems {
  return (
    typeof value === "object" &&
    value !== null &&
    "draft" in value &&
    typeof (value as { draft?: unknown }).draft === "object"
  );
}
