import { parseExpenseAmountString } from "../expenseEntries/expenseEntryItem";
import {
  isDiscountLine,
  isValidSignedLineItemAmount,
  type ReceiptItemLineType,
} from "../receipt/discountItems";
import { isValidIsoDateString } from "../week/weekDates";
import type { AiExpenseDraftDocumentType } from "./constants";
import type { AiExpenseRegistrationMode } from "./receiptDataContract";

export type ReviewFormInput = {
  documentType: AiExpenseDraftDocumentType;
  shopName: string;
  date: string;
  amountYen: string;
  categoryId: string;
  registrationMode?: AiExpenseRegistrationMode;
};

export type ReviewItemInput = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: string;
  categoryId: string;
  discountTargetItemId?: string;
};

type ReviewCategoryAmountTotal = {
  categoryId: string;
  amountYen: number;
};

function computeCategoryAmountTotals(items: ReviewItemInput[]): ReviewCategoryAmountTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.categoryId) {
      continue;
    }
    const amountYen = Number(item.amountYen) || 0;
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + amountYen);
  }
  return [...totals.entries()].map(([categoryId, amountYen]) => ({ categoryId, amountYen }));
}

export type ReviewValidationIssue = {
  code:
    | "document"
    | "shopName"
    | "date"
    | "amount"
    | "category"
    | "itemName"
    | "itemAmount"
    | "itemCategory"
    | "discountTarget"
    | "aggregate";
  field: string;
  itemIndex?: number;
  required: boolean;
};

export function validateReviewInput(
  form: ReviewFormInput,
  items: ReviewItemInput[],
): ReviewValidationIssue[] {
  const issues: ReviewValidationIssue[] = [];
  const add = (
    code: ReviewValidationIssue["code"],
    field: string,
    required = true,
    itemIndex?: number,
  ) => issues.push({ code, field, required, ...(itemIndex === undefined ? {} : { itemIndex }) });
  if (form.documentType === "unknown") add("document", "document");
  if (!form.shopName.trim()) add("shopName", "shopName");
  if (!isValidIsoDateString(form.date)) add("date", "date");
  if (!parseExpenseAmountString(form.amountYen).success) add("amount", "amountYen");
  if (!form.categoryId) add("category", "categoryId");
  if (form.registrationMode !== "totalOnly") {
    items.forEach((item, index) => {
      if (isDiscountLine(item.itemName, item.lineType) && !item.discountTargetItemId)
        add("discountTarget", "discountTargetItemId", false, index);
      if (!item.itemName.trim()) add("itemName", "itemName", true, index);
      else if (!isValidSignedLineItemAmount(item.itemName, Number(item.amountYen), item.lineType))
        add("itemAmount", "amountYen", true, index);
      else if (!item.categoryId) add("itemCategory", "categoryId", true, index);
    });
    if (
      !issues.some((issue) => issue.itemIndex !== undefined && issue.required) &&
      computeCategoryAmountTotals(items).some((aggregate) => aggregate.amountYen <= 0)
    )
      add("aggregate", "items");
  }
  return issues;
}

const validForm: ReviewFormInput = {
  documentType: "receipt",
  shopName: "x",
  date: "2026-01-01",
  amountYen: "1",
  categoryId: "x",
};

export function getReviewDocumentTypeErrorMessage(
  documentType: AiExpenseDraftDocumentType,
): string | null {
  return validateReviewInput({ ...validForm, documentType }, []).some(
    (issue) => issue.code === "document",
  )
    ? "書類種別を選択してください。"
    : null;
}

export function getReviewFormErrorMessage(form: ReviewFormInput): string | null {
  return validateReviewInput(form, []).some((issue) =>
    ["shopName", "date", "amount", "category"].includes(issue.code),
  )
    ? "店名・内容、支出日、金額、カテゴリを確認してください。"
    : null;
}

export function getReviewItemsErrorMessage(items: ReviewItemInput[]): string | null {
  return validateReviewInput(validForm, items).some(
    (issue) => issue.itemIndex !== undefined && issue.required,
  )
    ? "明細名、明細金額、カテゴリを確認してください。"
    : null;
}

/** レビュー明細のカテゴリ別合計金額エラーをユーザー向けメッセージに変換する。 */
export function getReviewCategoryAggregateErrorMessage(
  reviewItems: ReviewItemInput[],
): string | null {
  if (computeCategoryAmountTotals(reviewItems).some((aggregate) => aggregate.amountYen <= 0)) {
    return "割引後のカテゴリ金額は1円以上にしてください。";
  }
  return null;
}

/** レビュー送信前の総合エラーをユーザー向けメッセージに変換する。 */
export function getReviewSubmitErrorMessage(
  reviewForm: ReviewFormInput,
  reviewItems: ReviewItemInput[],
): string | null {
  const issues = validateReviewInput(reviewForm, reviewItems);
  if (issues.some((issue) => issue.code === "document")) return "書類種別を選択してください。";
  if (issues.some((issue) => ["shopName", "date", "amount", "category"].includes(issue.code)))
    return "店名・内容、支出日、金額、カテゴリを確認してください。";
  if (issues.some((issue) => issue.itemIndex !== undefined && issue.required))
    return "明細名、明細金額、カテゴリを確認してください。";
  return issues.some((issue) => issue.code === "aggregate")
    ? "割引後のカテゴリ金額は1円以上にしてください。"
    : null;
}
