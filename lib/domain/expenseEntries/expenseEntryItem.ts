/**
 * 支出項目（expense entry item）に関するドメインルール。
 * UI / Convex の両方から利用できる純粋関数のみを含む。
 */

/** 支出項目タイトルの最大文字数。 */
export const EXPENSE_ENTRY_TITLE_MAX_LENGTH = 100;

/** 支出項目メモの最大文字数。 */
export const EXPENSE_ENTRY_MEMO_MAX_LENGTH = 500;

/** 支出金額の最大値（円）。 */
export const EXPENSE_ENTRY_AMOUNT_MAX = 9_999_999;

/** 数値金額の検証失敗理由。 */
export type ExpenseAmountError = "not_positive_integer" | "too_large";

/**
 * 数値の支出金額を検証する。
 * 正の整数、かつ最大値以下であることを確認する。
 */
export function validateExpenseAmount(
  amount: number,
): { success: true } | { success: false; error: ExpenseAmountError } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, error: "not_positive_integer" };
  }
  if (amount > EXPENSE_ENTRY_AMOUNT_MAX) {
    return { success: false, error: "too_large" };
  }
  return { success: true };
}

/** 文字列金額の検証失敗理由。 */
export type ExpenseAmountStringError = "required" | "not_number" | "not_positive" | "too_large";

/**
 * 入力された文字列の支出金額を数値に変換・検証する。
 * 数字のみを受け付け、空文字・非数字・0以下・最大値超過を拒否する。
 */
export function parseExpenseAmountString(
  amountYen: string,
): { success: true; amountYen: number } | { success: false; error: ExpenseAmountStringError } {
  if (amountYen === "") {
    return { success: false, error: "required" };
  }
  if (!/^-?\d+$/.test(amountYen)) {
    return { success: false, error: "not_number" };
  }
  const value = Number(amountYen);
  if (value <= 0) {
    return { success: false, error: "not_positive" };
  }
  if (value > EXPENSE_ENTRY_AMOUNT_MAX) {
    return { success: false, error: "too_large" };
  }
  return { success: true, amountYen: value };
}

/** タイトルの検証失敗理由。 */
export type ExpenseTitleError = "empty" | "too_long";

/**
 * 支出項目タイトルを trim し、空文字・長さ超過を検証する。
 */
export function validateExpenseTitle(
  title: string,
): { success: true; title: string } | { success: false; error: ExpenseTitleError } {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "empty" };
  }
  if (trimmed.length > EXPENSE_ENTRY_TITLE_MAX_LENGTH) {
    return { success: false, error: "too_long" };
  }
  return { success: true, title: trimmed };
}

/** メモの検証失敗理由。 */
export type ExpenseMemoError = "too_long";

/**
 * メモが指定されていれば長さを検証し、空文字は undefined として扱う。
 */
export function validateExpenseMemo(
  memo: string | undefined,
): { success: true; memo?: string } | { success: false; error: ExpenseMemoError } {
  if (memo === undefined || memo === "") {
    return { success: true, memo: undefined };
  }
  if (memo.length > EXPENSE_ENTRY_MEMO_MAX_LENGTH) {
    return { success: false, error: "too_long" };
  }
  return { success: true, memo };
}

/** 支出項目のフィールド名。 */
export type ExpenseItemField = "categoryId" | "amountYen" | "title" | "memo";

/** 支出項目の検証済みデータ。 */
export type ExpenseItem = {
  categoryId: string;
  amountYen: number;
  title: string;
  memo?: string;
};

/** 支出項目の入力データ（UI からの未検証値）。 */
export type ExpenseItemInput = {
  categoryId: string;
  amountYen: string;
  title: string;
  memo?: string;
};

/** 支出項目のフィールドごとの検証失敗理由。 */
export type ExpenseItemErrors = Partial<Record<ExpenseItemField, string>>;

/** 支出項目のフィールドごとの検証エラーをユーザー向けメッセージに変換する */
export function getExpenseItemFieldErrorMessage(field: ExpenseItemField, error: string): string {
  switch (field) {
    case "categoryId":
      return "カテゴリは必須です";
    case "amountYen": {
      switch (error) {
        case "required":
          return "金額は必須です";
        case "not_number":
          return "金額は数字のみで入力してください";
        case "too_large":
          return `金額は ${EXPENSE_ENTRY_AMOUNT_MAX.toLocaleString("ja-JP")} 円以下です`;
        default:
          return "金額は 1 円以上です";
      }
    }
    case "title": {
      switch (error) {
        case "empty":
          return "内容は必須です";
        case "too_long":
          return `内容は ${EXPENSE_ENTRY_TITLE_MAX_LENGTH} 文字以内です`;
        default:
          return "内容を確認してください";
      }
    }
    case "memo":
      return `メモは ${EXPENSE_ENTRY_MEMO_MAX_LENGTH} 文字以内です`;
  }
}

export type ValidateExpenseItemsSuccess = {
  success: true;
  data: {
    items: ExpenseItem[];
    /** sourceAmount 未指定時は null */
    difference: number | null;
  };
};

export type ValidateExpenseItemsFailure =
  | { success: false; reason: "no_items" }
  | { success: false; reason: "item_errors"; itemErrors: ExpenseItemErrors[] }
  | { success: false; reason: "amount_exceeded"; difference: number };

/**
 * 複数の支出項目を一括で検証する。
 * sourceAmount が指定されていれば、項目合計との差額を検証する。
 */
export function validateExpenseItems(input: {
  sourceAmount: number | undefined;
  items: ExpenseItemInput[];
}): ValidateExpenseItemsSuccess | ValidateExpenseItemsFailure {
  if (input.items.length === 0) {
    return { success: false, reason: "no_items" };
  }

  const parsedItems: ExpenseItem[] = [];
  const itemErrors: ExpenseItemErrors[] = [];
  let hasErrors = false;

  for (const item of input.items) {
    const result = validateExpenseItemInput(item);
    if (result.success) {
      parsedItems.push(result.data);
      itemErrors.push({});
    } else {
      parsedItems.push({ categoryId: "", amountYen: 0, title: "" });
      itemErrors.push(result.errors);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    return { success: false, reason: "item_errors", itemErrors };
  }

  if (input.sourceAmount === undefined) {
    return { success: true, data: { items: parsedItems, difference: null } };
  }

  const totalAmount = parsedItems.reduce((sum, item) => sum + item.amountYen, 0);
  const difference = input.sourceAmount - totalAmount;

  if (difference < 0) {
    return { success: false, reason: "amount_exceeded", difference };
  }

  return { success: true, data: { items: parsedItems, difference } };
}

/**
 * UI からの入力値を支出項目データに変換・検証する。
 * 金額は文字列から数値に変換される。
 */
export function validateExpenseItemInput(
  input: ExpenseItemInput,
): { success: true; data: ExpenseItem } | { success: false; errors: ExpenseItemErrors } {
  const errors: ExpenseItemErrors = {};

  if (input.categoryId === "") {
    errors.categoryId = "empty";
  }

  const amountResult = parseExpenseAmountString(input.amountYen);
  let amountYen: number | undefined;
  if (!amountResult.success) {
    errors.amountYen = amountResult.error;
  } else {
    amountYen = amountResult.amountYen;
  }

  let title = input.title;
  const titleResult = validateExpenseTitle(input.title);
  if (!titleResult.success) {
    errors.title = titleResult.error;
  } else {
    title = titleResult.title;
  }

  let memo = input.memo;
  const memoResult = validateExpenseMemo(input.memo);
  if (!memoResult.success) {
    errors.memo = memoResult.error;
  } else {
    memo = memoResult.memo;
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      categoryId: input.categoryId,
      amountYen: amountYen as number,
      title,
      memo,
    },
  };
}
