import type { Id } from "../../../../convex/_generated/dataModel";
import {
  getExpenseItemFieldErrorMessage,
  validateExpenseItemInput,
  validateExpenseItems as validateExpenseItemsDomain,
  validateExpenseMemo,
  type ExpenseItemErrors,
} from "../../../../lib/domain/expenseEntries/expenseEntryItem";

export type ExpenseItemEntryInput = {
  categoryId: Id<"categories"> | "";
  amountYen: string;
  title: string;
  memo?: string;
};

type ExpenseItemEntryParsed = {
  categoryId: Id<"categories">;
  amountYen: number;
  title: string;
  memo?: string;
};

export type ExpenseItemEntryErrors = Partial<{
  categoryId: string;
  amountYen: string;
  title: string;
  memo: string;
}>;

function mapExpenseItemErrors(errors: ExpenseItemErrors): ExpenseItemEntryErrors {
  const mapped: ExpenseItemEntryErrors = {};
  for (const [field, code] of Object.entries(errors)) {
    if (code) {
      mapped[field as keyof ExpenseItemEntryErrors] = getExpenseItemFieldErrorMessage(
        field as "categoryId" | "amountYen" | "title" | "memo",
        code,
      );
    }
  }
  return mapped;
}

export function validateExpenseItemEntry(
  data: ExpenseItemEntryInput,
):
  | { success: true; data: ExpenseItemEntryParsed }
  | { success: false; errors: ExpenseItemEntryErrors } {
  const result = validateExpenseItemInput({
    categoryId: data.categoryId,
    amountYen: data.amountYen,
    title: data.title,
    memo: data.memo,
  });

  if (result.success) {
    return {
      success: true,
      data: {
        categoryId: result.data.categoryId as Id<"categories">,
        amountYen: result.data.amountYen,
        title: result.data.title,
        memo: result.data.memo,
      },
    };
  }

  return { success: false, errors: mapExpenseItemErrors(result.errors) };
}

type ValidateExpenseItemsInput = {
  sourceAmount: number | undefined;
  items: ExpenseItemEntryInput[];
};

/**
 * 支出全体のメモ（明細とは別のフォーム状態）を検証する。
 * 失敗時はユーザー向けメッセージを返す。
 */
export function validateExpenseMemoEntry(
  memo: string,
): { success: true } | { success: false; error: string } {
  const result = validateExpenseMemo(memo === "" ? undefined : memo);
  if (result.success) {
    return { success: true };
  }
  return { success: false, error: getExpenseItemFieldErrorMessage("memo", result.error) };
}

type ValidateExpenseItemsSuccess = {
  success: true;
  data: {
    items: ExpenseItemEntryParsed[];
    /** 差額 = sourceAmount - items合計。sourceAmountが未指定の場合はnull */
    difference: number | null;
  };
};

type ValidateExpenseItemsFailure =
  | { success: false; reason: "no_items" }
  | { success: false; reason: "item_errors"; itemErrors: ExpenseItemEntryErrors[] }
  | { success: false; reason: "amount_exceeded"; difference: number };

export function validateExpenseItems(
  input: ValidateExpenseItemsInput,
): ValidateExpenseItemsSuccess | ValidateExpenseItemsFailure {
  const result = validateExpenseItemsDomain({
    sourceAmount: input.sourceAmount,
    items: input.items,
  });

  if (!result.success) {
    if (result.reason === "item_errors") {
      return {
        success: false,
        reason: "item_errors",
        itemErrors: result.itemErrors.map(mapExpenseItemErrors),
      };
    }
    return result;
  }

  return {
    success: true,
    data: {
      items: result.data.items.map((item) => ({
        categoryId: item.categoryId as Id<"categories">,
        amountYen: item.amountYen,
        title: item.title,
        memo: item.memo,
      })),
      difference: result.data.difference,
    },
  };
}
