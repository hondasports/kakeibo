import { isDiscountLine } from "../receipt/discountItems";
import type {
  AiExpenseDraftJudgmentInput,
  ReviewFormValues,
  ReviewItemValues,
} from "./reviewTypes";
import { validateReviewInput } from "./reviewValidation";
import {
  buildTaxContextFromReviewItem,
  getReviewItemTaxConfirmation,
} from "./receiptItemTaxViewModel";
import { isVerifiedTaxSummaryStatus } from "../receipt/tax/taxSummaryConsistency";
import { buildTaxRateCheck } from "./reviewTaxChecks";
import { getTaxSummaryConflictLabel } from "./receiptTaxLabels";
import { formatYen } from "../common/currency";

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
  draft?: AiExpenseDraftJudgmentInput | null,
): ReviewGuidanceItem[] {
  const issues: ReviewGuidanceItem[] = [];
  const add = (id: string, message: string, target: string, required: boolean) =>
    issues.push({ id, message, target, required });
  const validation = validateReviewInput(
    { ...form, registrationMode: effectiveReviewMode(form) },
    items,
  );
  const messages = {
    document: ["document", "書類種別を選択してください。"],
    shopName: ["shopName", "店名・内容を入力してください。"],
    date: ["date", "支出日を確認してください。"],
    amount: ["amount", "合計金額を1円以上で入力してください。"],
    category: ["category", "レシート全体のカテゴリを選択してください。"],
  } as const;
  for (const issue of validation) {
    if (issue.code in messages) {
      const [id, message] = messages[issue.code as keyof typeof messages];
      add(id, message, issue.field, issue.required);
    }
  }
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
    for (const [itemIndex, item] of items.entries()) {
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
      for (const issue of validation.filter((entry) => entry.itemIndex === itemIndex)) {
        if (issue.code === "discountTarget")
          add(
            "discount-" + item.id,
            "「" + name + "」：割引対象の商品を選択してください。",
            item.id,
            false,
          );
        if (issue.code === "itemName")
          add("name-" + item.id, "明細名を入力してください。", item.id, true);
        if (issue.code === "itemAmount")
          add("amount-" + item.id, "「" + name + "」：明細金額を確認してください。", item.id, true);
        if (issue.code === "itemCategory")
          add(
            "category-" + item.id,
            "「" + name + "」：カテゴリを選択してください。",
            item.id,
            true,
          );
      }
      if (buildTaxContextFromReviewItem(item).status === "unresolved") {
        add(
          `tax-${item.id}`,
          `「${item.itemName || "名称未設定"}」：${getReviewItemTaxConfirmation(item).message}`,
          item.id,
          false,
        );
      }
    }
    if (validation.some((issue) => issue.code === "aggregate"))
      add("aggregate", "割引後のカテゴリ金額は1円以上にしてください。", "items", true);
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
