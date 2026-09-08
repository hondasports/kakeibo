import { parseExpenseAmountString } from "../../../../lib/domain/expenseEntries/expenseEntryItem";
import { isValidIsoDateString } from "../../../../lib/domain/week/weekDates";
import { isDiscountLine, isValidReviewItemAmount } from "./discountItems";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
import {
  getReviewDocumentTypeError,
  getReviewItemsError,
  getReviewCategoryAggregateError,
} from "./reviewValidation";
import { buildTaxContextFromReviewItem } from "./receiptItemTaxViewModel";

export type ReviewGuidanceItem = {
  id: string;
  message: string;
  target: string;
  required: boolean;
  scope?: "receipt";
};

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
  const documentError = getReviewDocumentTypeError(form.documentType);
  if (documentError) add("document", documentError, "document", true);
  if (!form.shopName.trim()) add("shopName", "店名・内容を入力してください。", "shopName", true);
  if (!isValidIsoDateString(form.date)) add("date", "支出日を確認してください。", "date", true);
  if (!parseExpenseAmountString(form.amountYen).success)
    add("amount", "合計金額を1円以上で入力してください。", "amountYen", true);
  if (!form.categoryId)
    add("category", "レシート全体のカテゴリを選択してください。", "categoryId", true);
  if (effectiveReviewMode(form) === "detailed") {
    draft?.taxSummaries?.forEach((summary, index) => {
      if (
        ["ambiguous", "contradictory", "reconcilable", "conflicting"].includes(summary.status ?? "")
      ) {
        add(
          `summary-${index}`,
          `${summary.taxRatePercent}%の税内訳：対象額・税額・税込／税抜をレシートと照合してください。`,
          "reference",
          false,
        );
      }
    });
    for (const item of items) {
      const name = item.itemName || "名称未設定";
      if (isDiscountLine(item.itemName, item.lineType) && !item.discountTargetItemId)
        add(
          "discount-" + item.id,
          "「" + name + "」：割引対象の商品を選択してください。",
          item.id,
          true,
        );
      else if (!item.itemName.trim())
        add("name-" + item.id, "明細名を入力してください。", item.id, true);
      else if (!isValidReviewItemAmount(item.itemName, Number(item.amountYen), item.lineType))
        add("amount-" + item.id, "「" + name + "」：明細金額を確認してください。", item.id, true);
      else if (!item.categoryId)
        add("category-" + item.id, "「" + name + "」：カテゴリを選択してください。", item.id, true);
      if (buildTaxContextFromReviewItem(item).status === "unresolved") {
        add(
          `tax-${item.id}`,
          `「${item.itemName || "名称未設定"}」：税率・税込／税抜を確認してください。`,
          item.id,
          false,
        );
      }
    }
    if (!items.some((item) => getReviewItemsError([item]))) {
      const aggregateError = getReviewCategoryAggregateError(items);
      if (aggregateError) add("aggregate", aggregateError, "items", true);
    }
    const total = items.reduce(
      (sum, item) => sum + (item.normalizedAmountYen ?? Number(item.amountYen)),
      0,
    );
    if (items.length && Number.isFinite(total) && Number(form.amountYen) !== total) {
      add(
        "difference",
        `支払額と商品合計に${Math.abs(Number(form.amountYen) - total).toLocaleString()}円の差があります。明細・割引・税を確認してください。`,
        "items",
        false,
      );
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

export function reviewSaveSummary(form: ReviewFormValues, items: ReviewItemValues[]) {
  const parsed = items.map((item) => Number(item.amountYen));
  const validAmounts = items.every(
    (item, index) => item.amountYen.trim() !== "" && Number.isFinite(parsed[index]),
  );
  const itemTotal = validAmounts
    ? items.reduce((sum, item) => sum + (item.normalizedAmountYen ?? Number(item.amountYen)), 0)
    : undefined;
  const taxResolved =
    items.length > 0 &&
    items.every(
      (item) =>
        buildTaxContextFromReviewItem(item).status === "resolved" &&
        item.allocatedTaxYen !== undefined,
    );
  return {
    itemTotal,
    taxYen: taxResolved ? items.reduce((sum, item) => sum + item.allocatedTaxYen!, 0) : undefined,
    difference:
      itemTotal !== undefined &&
      form.amountYen.trim() !== "" &&
      Number.isFinite(Number(form.amountYen))
        ? Number(form.amountYen) - itemTotal
        : undefined,
  };
}
