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

const FORM_CODES = ["shopName", "date", "amount", "category"] as const;
const REVIEW_CODES = [
  "document",
  ...FORM_CODES,
  "itemName",
  "itemAmount",
  "itemCategory",
  "discountTarget",
  "aggregate",
] as const;
type ReviewValidationCode = (typeof REVIEW_CODES)[number];

const FORM_ERROR = "店名・内容、支出日、金額、カテゴリを確認してください。";
const DOCUMENT_ERROR = "書類種別を選択してください。";
const AGGREGATE_ERROR = "割引後のカテゴリ金額は1円以上にしてください。";
const ITEM_ERROR = "明細名、明細金額、カテゴリを確認してください。";
export const REVIEW_VALIDATION_MESSAGES = {
  document: { guidance: DOCUMENT_ERROR, submit: DOCUMENT_ERROR },
  shopName: { guidance: "店名・内容を入力してください。", submit: FORM_ERROR },
  date: { guidance: "支出日を確認してください。", submit: FORM_ERROR },
  amount: { guidance: "合計金額を1円以上で入力してください。", submit: FORM_ERROR },
  category: { guidance: "レシート全体のカテゴリを選択してください。", submit: FORM_ERROR },
  itemName: { guidance: "明細名を入力してください。", submit: ITEM_ERROR },
  itemAmount: { guidance: null, submit: ITEM_ERROR },
  itemCategory: { guidance: null, submit: ITEM_ERROR },
  discountTarget: { guidance: null, submit: null },
  aggregate: { guidance: AGGREGATE_ERROR, submit: AGGREGATE_ERROR },
} as const satisfies Record<
  ReviewValidationCode,
  { guidance: string | null; submit: string | null }
>;

export type ReviewValidationIssue = {
  code: ReviewValidationCode;
  field: string;
  itemIndex?: number;
  required: boolean;
};

function validateDocumentType(documentType: AiExpenseDraftDocumentType): ReviewValidationIssue[] {
  return documentType === "unknown"
    ? [{ code: "document", field: "document", required: true }]
    : [];
}

function validateForm(form: ReviewFormInput): ReviewValidationIssue[] {
  const issues: ReviewValidationIssue[] = [];
  if (!form.shopName.trim()) issues.push({ code: "shopName", field: "shopName", required: true });
  if (!isValidIsoDateString(form.date))
    issues.push({ code: "date", field: "date", required: true });
  if (!parseExpenseAmountString(form.amountYen).success)
    issues.push({ code: "amount", field: "amountYen", required: true });
  if (!form.categoryId) issues.push({ code: "category", field: "categoryId", required: true });
  return issues;
}

function validateItems(items: ReviewItemInput[]): ReviewValidationIssue[] {
  const issues: ReviewValidationIssue[] = [];
  items.forEach((item, itemIndex) => {
    const add = (code: ReviewValidationCode, field: string, required = true) =>
      issues.push({ code, field, required, itemIndex });
    // 割引対象は確認推奨であり、未確定でも下書き保存を妨げない。
    if (isDiscountLine(item.itemName, item.lineType) && !item.discountTargetItemId)
      add("discountTarget", "discountTargetItemId", false);
    if (!item.itemName.trim()) add("itemName", "itemName");
    else if (!isValidSignedLineItemAmount(item.itemName, Number(item.amountYen), item.lineType))
      add("itemAmount", "amountYen");
    else if (!item.categoryId) add("itemCategory", "categoryId");
  });
  return issues;
}

function validateAggregate(items: ReviewItemInput[]): ReviewValidationIssue[] {
  return computeCategoryAmountTotals(items).some((aggregate) => aggregate.amountYen <= 0)
    ? [{ code: "aggregate", field: "items", required: true }]
    : [];
}

export function validateReviewInput(
  form: ReviewFormInput,
  items: ReviewItemInput[],
): ReviewValidationIssue[] {
  const issues = [...validateDocumentType(form.documentType), ...validateForm(form)];
  if (form.registrationMode !== "totalOnly") {
    const itemIssues = validateItems(items);
    issues.push(...itemIssues);
    if (!itemIssues.some((issue) => issue.required)) issues.push(...validateAggregate(items));
  }
  return issues;
}

export function getReviewDocumentTypeErrorMessage(
  documentType: AiExpenseDraftDocumentType,
): string | null {
  return validateDocumentType(documentType).length
    ? REVIEW_VALIDATION_MESSAGES.document.submit
    : null;
}

function isFormCode(code: ReviewValidationCode): boolean {
  return (FORM_CODES as readonly ReviewValidationCode[]).includes(code);
}

export function getReviewFormErrorMessage(form: ReviewFormInput): string | null {
  const issue = validateForm(form).find((entry) => isFormCode(entry.code));
  return issue ? REVIEW_VALIDATION_MESSAGES[issue.code].submit : null;
}

export function getReviewItemsErrorMessage(items: ReviewItemInput[]): string | null {
  const issue = validateItems(items).find((entry) => entry.required);
  return issue ? REVIEW_VALIDATION_MESSAGES[issue.code].submit : null;
}

export function getReviewCategoryAggregateErrorMessage(items: ReviewItemInput[]): string | null {
  return validateAggregate(items).length ? REVIEW_VALIDATION_MESSAGES.aggregate.submit : null;
}

export function getReviewSubmitErrorMessage(
  form: ReviewFormInput,
  items: ReviewItemInput[],
): string | null {
  const issue = validateReviewInput(form, items).find((entry) => entry.required);
  return issue ? REVIEW_VALIDATION_MESSAGES[issue.code].submit : null;
}
