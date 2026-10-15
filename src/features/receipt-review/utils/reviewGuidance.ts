import { parseExpenseAmountString } from "../../../../lib/domain/expenseEntries/expenseEntryItem";
import { isValidIsoDateString } from "../../../../lib/domain/week/weekDates";
import {
  isDiscountLine,
  isValidSignedLineItemAmount,
} from "../../../../lib/domain/receipt/discountItems";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
import {
  getReviewDocumentTypeErrorMessage,
  getReviewItemsErrorMessage,
  getReviewCategoryAggregateErrorMessage,
} from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";
import {
  buildTaxContextFromReviewItem,
  getReviewItemTaxConfirmation,
} from "./receiptItemTaxViewModel";
import { isVerifiedTaxSummaryStatus } from "../../../../lib/domain/receipt/tax/taxSummaryConsistency";
import { buildTaxRateCheck } from "./reviewTaxChecks";
import { getTaxSummaryConflictLabel } from "./receiptTaxLabels";
import { formatYen } from "../../../utils/currency";

export type ReviewGuidanceItem = {
  id: string;
  message: string;
  target: string;
  required: boolean;
  scope?: "receipt";
  taxSummaryIndex?: number;
};

/** 内部の再解釈の経過で、商品を直しても解消しない・直す先が無い理由。 */
const NON_ACTIONABLE_SUMMARY_REASONS: ReadonlySet<string> = new Set([
  "unresolved_tax_summary",
  "reconciled_to_included",
  "reconciled_to_external",
]);

export function effectiveReviewMode(form: ReviewFormValues) {
  return form.priceTaxTreatment === "unknown" || form.taxRateComposition === "unknown"
    ? "totalOnly"
    : form.registrationMode;
}

/** The same list drives required counts, inline messages and the primary action. */
export function getReviewGuidance(
  form: ReviewFormValues,
  items: ReviewItemValues[],
  draft?: AiExpenseDraft | null,
): ReviewGuidanceItem[] {
  const issues: ReviewGuidanceItem[] = [];
  const add = (id: string, message: string, target: string, required: boolean) =>
    issues.push({ id, message, target, required });
  const documentError = getReviewDocumentTypeErrorMessage(form.documentType);
  if (documentError) add("document", documentError, "document", true);
  if (!form.shopName.trim()) add("shopName", "店名・内容を入力してください。", "shopName", true);
  if (!isValidIsoDateString(form.date)) add("date", "支出日を確認してください。", "date", true);
  if (!parseExpenseAmountString(form.amountYen).success)
    add("amount", "合計金額を1円以上で入力してください。", "amountYen", true);
  if (!form.categoryId)
    add("category", "レシート全体のカテゴリを選択してください。", "categoryId", true);
  if (effectiveReviewMode(form) === "detailed") {
    const taxCheck = buildTaxRateCheck({
      items,
      taxSummaries: draft?.taxSummaries,
      rawObservation: draft?.rawObservation,
      receiptLineClassifications: draft?.receiptInterpretation?.values.receiptLineClassifications,
    });
    draft?.taxSummaries?.forEach((summary, index) => {
      const row = taxCheck.rows[index];
      // 内部の再解釈状態や、ユーザーが触れない集計の読み取りは、確認推奨に出さない。
      const reasons = (summary.reasons ?? [])
        .filter((reason) => !NON_ACTIONABLE_SUMMARY_REASONS.has(reason))
        .map(getTaxSummaryConflictLabel);
      const unresolvedDeclaration =
        summary.taxMode === "unknown" || summary.taxableAmountBasis === "unknown";
      if (unresolvedDeclaration) reasons.push("商品の税率・税込／税抜を確認してください");
      if (row?.status === "mismatch")
        reasons.push(
          `明細の対象額 ${formatYen(row.currentYen ?? 0)} ／ 税内訳 ${formatYen(summary.taxableAmountYen)}`,
        );
      if (row?.blockerCode === "basis-conflict" && row.reason) reasons.push(row.reason);
      const unresolvedStatus =
        summary.status !== undefined && !isVerifiedTaxSummaryStatus(summary.status);
      if (!unresolvedStatus && reasons.length === 0) return;
      issues.push({
        id: `summary-${index}`,
        message: `${summary.taxRatePercent}%の商品とレシートの照合：${
          [...new Set(reasons)].join(" / ") ||
          "商品の金額・税率・税込／税抜と割引対象を、読み取り原文と照合してください"
        }。`,
        target: "items",
        required: false,
        taxSummaryIndex: index,
      });
    });
    for (const item of items) {
      const name = item.itemName || "名称未設定";
      const target = items.find((candidate) => candidate.id === item.discountTargetItemId);
      if (
        isDiscountLine(item.itemName, item.lineType) &&
        target &&
        item.taxRatePercent != null &&
        target.taxRatePercent != null &&
        item.taxRatePercent !== target.taxRatePercent
      ) {
        add(
          "discount-tax-" + item.id,
          "「" +
            name +
            "」：割引の対象税率が対象商品（" +
            target.taxRatePercent +
            "%）と異なります。レシートを確認して選択してください。",
          item.id,
          false,
        );
      }
      if (
        !issues.some((issue) => issue.id === "allocation") &&
        !issues.some(
          (issue) =>
            issue.taxSummaryIndex !== undefined &&
            draft?.taxSummaries?.[issue.taxSummaryIndex]?.taxRatePercent === item.taxRatePercent,
        ) &&
        item.taxAllocationStatus === "unallocated" &&
        buildTaxContextFromReviewItem(item).status === "resolved"
      ) {
        add(
          "allocation",
          "「" +
            name +
            "」：税額は未確定です。商品の金額・税率・税込／税抜と割引対象を、読み取り原文と照合してください。",
          "items",
          false,
        );
      }
      // 割引対象の未確定は税率別集計を比較不能にする確認項目。
      // 下書き保存は妨げない（登録前に解消する必須検証とは分離する）。
      if (isDiscountLine(item.itemName, item.lineType) && !item.discountTargetItemId)
        add(
          "discount-" + item.id,
          "「" + name + "」：割引対象の商品を選択してください。",
          item.id,
          false,
        );
      else if (!item.itemName.trim())
        add("name-" + item.id, "明細名を入力してください。", item.id, true);
      else if (!isValidSignedLineItemAmount(item.itemName, Number(item.amountYen), item.lineType))
        add("amount-" + item.id, "「" + name + "」：明細金額を確認してください。", item.id, true);
      else if (!item.categoryId)
        add("category-" + item.id, "「" + name + "」：カテゴリを選択してください。", item.id, true);
      if (buildTaxContextFromReviewItem(item).status === "unresolved") {
        add(
          `tax-${item.id}`,
          `「${item.itemName || "名称未設定"}」：${getReviewItemTaxConfirmation(item).message}`,
          item.id,
          false,
        );
      }
    }
    if (!items.some((item) => getReviewItemsErrorMessage([item]))) {
      const aggregateError = getReviewCategoryAggregateErrorMessage(items);
      if (aggregateError) add("aggregate", aggregateError, "items", true);
    }
  }
  if (
    draft?.reviewReasons.some((reason) =>
      ["low_confidence", "user_confirmation_required", "parse_failed"].includes(reason),
    )
  ) {
    issues.push({
      id: "reading",
      message:
        "レシート全体の読み取り確認です。特定の誤りを検出したものではありません。画像と商品名・金額を見比べてください。",
      target: "items",
      required: false,
      scope: "receipt",
    });
  }
  return issues;
}
