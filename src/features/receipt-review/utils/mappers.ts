import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getImageCaptureFailureHint } from "../../../../lib/domain/aiExpenseDrafts/failure";
import { getDraftTitle } from "../../../../lib/domain/aiExpenseDrafts/title";
import { resolveReviewItemDisplayAmountYen } from "../../../../lib/domain/aiExpenseDrafts/reviewItemAmounts";
import { RECEIPT_TAX_CHOICE_FIELDS } from "../../../../lib/domain/aiExpenseDrafts/receiptDataContract";
import type {
  AiExpenseDraft,
  AiExpenseDraftStatus,
  AiExpenseDraftWithItems,
  ReviewFormValues,
  ReviewItemValues,
} from "../types/types";
import type { AiExpenseQueueItem, AiExpenseQueueStatus } from "../../../types/aiExpenseQueue";
import { buildReviewChecks } from "./reviewChecks";
import { dropResolvedAmountTaxReasons } from "./reviewFeedback";
import { getReviewGuidance } from "./reviewGuidance";
import { initializeReviewCategoryState } from "./reviewItemCategories";
import { applyReviewItemsTaxPreview, buildReviewTaxPreview } from "./reviewItemsTaxPreview";

export const emptyReviewForm: ReviewFormValues = {
  documentType: "receipt",
  shopName: "",
  date: "",
  amountYen: "",
  categoryId: "",
  registrationMode: "detailed",
};

/**
 * 金額・税内訳の解決に関係しない案内のid（店名・日付・カテゴリ・読み取り確認）。
 * これ以外の案内（税内訳、未配分、割引、明細の金額不備、カテゴリ別合計など）は
 * 金額・税内訳の理由を残す根拠にする。
 */
export function isUnrelatedToAmountTaxGuidanceId(id: string): boolean {
  return (
    id === "document" ||
    id === "shopName" ||
    id === "date" ||
    id === "category" ||
    id === "reading" ||
    id.startsWith("category-")
  );
}

/**
 * 下書き確認ダイアログと同じ初期化・再解釈・照合で、金額と税内訳が解決済みか判定する。
 * 明細が無い、または照合できない場合は解決済みとみなさない。
 */
export function isAmountAndTaxResolved(draft: AiExpenseDraft): boolean {
  const paidTotalYen = draft.amountYen;
  if (!draft.items || draft.items.length === 0 || paidTotalYen === undefined) return false;
  const mappedForm = mapDraftToReviewForm(draft);
  // ダイアログの useReviewFormState と同じ順序で、割引対象の推論とカテゴリ初期化を先に行う。
  const categoryState = initializeReviewCategoryState(
    mapDraftItemsToReviewItems(draft.items),
    mappedForm.categoryId,
  );
  const form = { ...mappedForm, categoryId: categoryState.receiptCategoryId };
  const previewArgs = {
    paidTotalYen,
    taxSummaries: draft.taxSummaries,
    markerDefinitions: draft.markerDefinitions,
    priceTaxTreatment: form.priceTaxTreatment,
    taxRateComposition: form.taxRateComposition,
  };
  const sourceItems = applyReviewItemsTaxPreview(categoryState.items, previewArgs);
  const preview = buildReviewTaxPreview(sourceItems, previewArgs);
  const items = draft.taxSummaries?.length ? preview.items : sourceItems;
  const effectiveDraft = { ...draft, taxSummaries: preview.taxSummaries };
  const checks = buildReviewChecks({
    items,
    paidTotalYen,
    taxSummaries: effectiveDraft.taxSummaries,
    rawObservation: draft.rawObservation,
  });
  if (checks.amount.status !== "matched" || checks.taxRate.status !== "matched") return false;
  const guidance = getReviewGuidance(form, items, effectiveDraft, {
    summarySourceIndexes: preview.summarySourceIndexes,
    sourceTaxSummaries: draft.taxSummaries,
  });
  return guidance.every((issue) => isUnrelatedToAmountTaxGuidanceId(issue.id));
}

export function mapDraftToQueueItem(
  draft: AiExpenseDraft,
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
    reviewReasons: dropResolvedAmountTaxReasons(draft.reviewReasons, isAmountAndTaxResolved(draft)),
    itemTotalYen: draft.itemSummary?.itemTotalYen,
    itemDifferenceYen: draft.itemSummary?.itemDifferenceYen,
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
  };
}

export function mapDraftToReviewForm(draft: AiExpenseDraft): ReviewFormValues {
  // 全体設定で明示した軸だけを復元し、商品・内訳補正の派生値を再送しない。
  const overrideFields = draft.receiptUserOverride?.fields ?? [];
  const hasLegacyUnknownChoice =
    overrideFields.includes("receiptTaxDecision") &&
    (draft.registrationMode === "totalOnly" ||
      (!overrideFields.includes("items") && !overrideFields.includes("taxSummaries")));
  const hasSavedPriceChoice =
    overrideFields.includes(RECEIPT_TAX_CHOICE_FIELDS.priceTaxTreatment) ||
    (hasLegacyUnknownChoice && draft.receiptTaxDecision?.priceTaxTreatment === "unknown");
  const hasSavedRateChoice =
    overrideFields.includes(RECEIPT_TAX_CHOICE_FIELDS.taxRateComposition) ||
    (hasLegacyUnknownChoice && draft.receiptTaxDecision?.taxRateComposition === "unknown");
  return {
    documentType: draft.documentType,
    shopName: getDraftTitle(draft, ""),
    date: draft.date ?? "",
    amountYen: draft.amountYen?.toString() ?? "",
    categoryId: draft.categoryId ?? "",
    registrationMode: draft.registrationMode ?? "detailed",
    priceTaxTreatment: hasSavedPriceChoice
      ? draft.receiptTaxDecision?.priceTaxTreatment
      : undefined,
    taxRateComposition: hasSavedRateChoice
      ? draft.receiptTaxDecision?.taxRateComposition
      : undefined,
  };
}

export function mapDraftItemsToReviewItems(
  items: AiExpenseDraftWithItems["items"],
): ReviewItemValues[] {
  return items.map((item, index) => {
    const displayAmountYen = resolveReviewItemDisplayAmountYen(item);

    return {
      id: item._id ?? `item-${index}`,
      persistedItemId: item._id,
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: displayAmountYen.toString(),
      printedAmountYen: item.printedAmountYen,
      amountBasis: item.amountBasis,
      taxRatePercent: item.taxRatePercent,
      taxMarker: item.taxMarker,
      markers: item.markers,
      allocatedTaxYen: item.allocatedTaxYen,
      taxAllocationStatus: item.taxAllocationStatus,
      normalizedAmountYen: item.normalizedAmountYen,
      taxResolutionStatus: item.taxResolutionStatus,
      taxResolutionSource: item.taxResolutionSource,
      taxReviewReasons: item.taxReviewReasons,
      quantity: item.quantity,
      unitPriceYen: item.unitPriceYen,
      categoryId: item.categoryId ?? "",
      confidence: item.confidence,
      warnings: item.warnings,
    };
  });
}

export function isDraftWithItems(value: unknown): value is AiExpenseDraftWithItems {
  return (
    typeof value === "object" &&
    value !== null &&
    "draft" in value &&
    typeof (value as { draft?: unknown }).draft === "object"
  );
}
