import {
  EXPENSE_ENTRY_TITLE_MAX_LENGTH,
  EXPENSE_ENTRY_MEMO_MAX_LENGTH,
  validateExpenseAmount,
  validateExpenseMemo,
  validateExpenseTitle,
} from "../expenseEntries/expenseEntryItem";
import { isValidIsoDateString } from "../week/weekDates";

export type ReceiptType = "expense" | "income";

export type CreateReceiptInput<TId = string> = {
  type?: ReceiptType;
  date: string;
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: TId;
  memo?: string;
};

export type NormalizedCreateReceipt<TId = string> = {
  type?: ReceiptType;
  date: string;
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: TId;
  memo?: string;
};

export type UpdateReceiptInput<TId = string> = {
  date?: string;
  shopName?: string;
  bankName?: string;
  amountYen?: number;
  categoryId?: TId;
  memo?: string;
};

export type NormalizedUpdateReceiptPatch = {
  date?: string;
  shopName?: string;
  bankName?: string;
  amountYen?: number;
  memo?: string;
};

function normalizeTitle(
  value: string | undefined,
  fieldName: string,
  requiredMessage: string,
): string | undefined {
  const target = value ?? "";
  const result = validateExpenseTitle(target);
  if (!result.success) {
    if (result.error === "empty") {
      throw new Error(requiredMessage);
    }
    throw new Error(`${fieldName} must be ${EXPENSE_ENTRY_TITLE_MAX_LENGTH} characters or fewer`);
  }
  return result.title;
}

/**
 * レシート作成用の入力を検証・正規化する。
 * 失敗時は Error を投げる（メッセージは ConvexError などへマッピング可能）。
 */
export function normalizeCreateReceiptArgs<TId>(
  input: CreateReceiptInput<TId>,
): NormalizedCreateReceipt<TId> {
  if (!isValidIsoDateString(input.date)) {
    throw new Error("Date must be a valid YYYY-MM-DD value");
  }

  if (!validateExpenseAmount(input.amountYen).success) {
    throw new Error("Amount must be a positive integer");
  }

  const memoResult = validateExpenseMemo(input.memo);
  if (!memoResult.success) {
    throw new Error(`Memo must be ${EXPENSE_ENTRY_MEMO_MAX_LENGTH} characters or less`);
  }

  let shopName: string | undefined;
  let bankName: string | undefined;

  if (input.type === "income") {
    bankName = normalizeTitle(
      input.bankName,
      "bankName",
      "bankName is required for income receipts",
    );
  } else {
    shopName = normalizeTitle(
      input.shopName,
      "shopName",
      "shopName is required for expense receipts",
    );
  }

  return {
    type: input.type,
    date: input.date,
    shopName,
    bankName,
    amountYen: input.amountYen,
    categoryId: input.categoryId,
    memo: memoResult.memo,
  };
}

/**
 * レシート更新用の入力を検証・正規化する。
 * 失敗時は Error を投げる。
 */
export function normalizeUpdateReceiptPatch<TId>(
  input: UpdateReceiptInput<TId>,
): NormalizedUpdateReceiptPatch {
  const patch: NormalizedUpdateReceiptPatch = {};

  if (input.date !== undefined) {
    if (!isValidIsoDateString(input.date)) {
      throw new Error("Date must be a valid YYYY-MM-DD value");
    }
    patch.date = input.date;
  }

  if (input.shopName !== undefined) {
    const result = validateExpenseTitle(input.shopName);
    if (!result.success) {
      throw new Error(`shopName must be ${EXPENSE_ENTRY_TITLE_MAX_LENGTH} characters or fewer`);
    }
    patch.shopName = result.title;
  }

  if (input.bankName !== undefined) {
    const result = validateExpenseTitle(input.bankName);
    if (!result.success) {
      throw new Error(`bankName must be ${EXPENSE_ENTRY_TITLE_MAX_LENGTH} characters or fewer`);
    }
    patch.bankName = result.title;
  }

  if (input.amountYen !== undefined) {
    if (!validateExpenseAmount(input.amountYen).success) {
      throw new Error("Amount must be a positive integer");
    }
    patch.amountYen = input.amountYen;
  }

  if (input.memo !== undefined) {
    const result = validateExpenseMemo(input.memo);
    if (!result.success) {
      throw new Error(`Memo must be ${EXPENSE_ENTRY_MEMO_MAX_LENGTH} characters or less`);
    }
    patch.memo = result.memo;
  }

  return patch;
}
