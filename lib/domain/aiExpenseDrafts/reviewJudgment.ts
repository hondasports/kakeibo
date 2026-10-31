import { buildReviewChecks } from "./reviewChecks";
import { getReviewGuidance } from "./reviewGuidance";
import { initializeReviewCategoryState } from "./reviewItemCategories";
import {
  applyReviewItemsTaxPreview,
  buildReviewTaxEvidence,
  buildReviewTaxPreview,
} from "./reviewItemsTaxPreview";
import { mapDraftItemsToReviewItems, mapDraftToReviewForm } from "./reviewDraftMapping";
import type { AiExpenseDraftJudgmentInput } from "./reviewTypes";

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
export function isAmountAndTaxResolved(draft: AiExpenseDraftJudgmentInput): boolean {
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
    ...buildReviewTaxEvidence(draft),
    paidTotalYen,
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
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
  });
  if (checks.amount.status !== "matched" || checks.taxRate.status !== "matched") return false;
  const guidance = getReviewGuidance(form, items, effectiveDraft);
  return guidance.every((issue) => isUnrelatedToAmountTaxGuidanceId(issue.id));
}
