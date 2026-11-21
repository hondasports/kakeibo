import {
  EXPENSE_ENTRY_TITLE_MAX_LENGTH,
  EXPENSE_ENTRY_MEMO_MAX_LENGTH,
  validateExpenseAmount,
  validateExpenseMemo,
  validateExpenseTitle,
} from "../expenseEntries/expenseEntryItem";
import { isValidIsoDateString } from "../week/weekDates";

export type UpdateReceiptInput<TId = string> = {
  date?: string;
  shopName?: string;
  bankName?: string;
  amountYen?: number;
  categoryId?: TId;
  memo?: string;
};

type NormalizedUpdateReceiptPatch = {
  date?: string;
  shopName?: string;
  bankName?: string;
  amountYen?: number;
  memo?: string;
};

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
