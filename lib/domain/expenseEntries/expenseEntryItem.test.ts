import { describe, expect, it } from "vitest";
import {
  EXPENSE_ENTRY_AMOUNT_MAX,
  EXPENSE_ENTRY_MEMO_MAX_LENGTH,
  EXPENSE_ENTRY_TITLE_MAX_LENGTH,
  getExpenseItemFieldErrorMessage,
  parseExpenseAmountString,
  validateExpenseAmount,
  validateExpenseItemInput,
  validateExpenseItems,
  validateExpenseMemo,
  validateExpenseTitle,
} from "./expenseEntryItem";

describe("domain constants", () => {
  it("支出項目の制約値が期待通り", () => {
    expect(EXPENSE_ENTRY_TITLE_MAX_LENGTH).toBe(100);
    expect(EXPENSE_ENTRY_MEMO_MAX_LENGTH).toBe(500);
    expect(EXPENSE_ENTRY_AMOUNT_MAX).toBe(9_999_999);
  });
});

describe("validateExpenseAmount", () => {
  it.each([1, 9_999_999, 1000])("%s 円は有効", (amount) => {
    expect(validateExpenseAmount(amount)).toEqual({ success: true });
  });

  it.each([0, -1, 1.5, Number.NaN])("%s は有効な支出金額ではない", (amount) => {
    const result = validateExpenseAmount(amount);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("not_positive_integer");
    }
  });

  it("最大金額を超える場合は too_large", () => {
    const result = validateExpenseAmount(10_000_000);
    expect(result).toEqual({ success: false, error: "too_large" });
  });
});

describe("parseExpenseAmountString", () => {
  it.each([
    ["1", 1],
    ["9999999", 9_999_999],
    ["0123", 123],
  ])("%s -> %s", (input, expected) => {
    expect(parseExpenseAmountString(input)).toEqual({
      success: true,
      amountYen: expected,
    });
  });

  it.each([
    ["", "required"],
    ["abc", "not_number"],
    ["-1", "not_positive"],
    ["0", "not_positive"],
    ["1.5", "not_number"],
    ["10000000", "too_large"],
  ])("%s -> %s", (input, expectedError) => {
    const result = parseExpenseAmountString(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(expectedError);
    }
  });
});

describe("validateExpenseTitle", () => {
  it("前後の空白を trim して成功する", () => {
    expect(validateExpenseTitle(" 食料品 ")).toEqual({
      success: true,
      title: "食料品",
    });
  });

  it("空文字は empty", () => {
    expect(validateExpenseTitle("   ")).toEqual({
      success: false,
      error: "empty",
    });
  });

  it("最大長を超える場合は too_long", () => {
    const result = validateExpenseTitle("a".repeat(EXPENSE_ENTRY_TITLE_MAX_LENGTH + 1));
    expect(result).toEqual({ success: false, error: "too_long" });
  });
});

describe("validateExpenseMemo", () => {
  it("undefined は有効", () => {
    expect(validateExpenseMemo(undefined)).toEqual({ success: true });
  });

  it("空文字は undefined として扱う", () => {
    expect(validateExpenseMemo("")).toEqual({ success: true, memo: undefined });
  });

  it("最大長を超える場合は too_long", () => {
    const result = validateExpenseMemo("a".repeat(EXPENSE_ENTRY_MEMO_MAX_LENGTH + 1));
    expect(result).toEqual({ success: false, error: "too_long" });
  });
});

describe("validateExpenseItemInput", () => {
  it("文字列金額を数値に変換して成功する", () => {
    const result = validateExpenseItemInput({
      categoryId: "cat-food",
      amountYen: "2000",
      title: "食料品",
      memo: "",
    });
    expect(result).toEqual({
      success: true,
      data: {
        categoryId: "cat-food",
        amountYen: 2000,
        title: "食料品",
        memo: undefined,
      },
    });
  });

  it("全項目を同時に検証する", () => {
    const result = validateExpenseItemInput({
      categoryId: "",
      amountYen: "abc",
      title: "",
      memo: "a".repeat(EXPENSE_ENTRY_MEMO_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.categoryId).toBe("empty");
      expect(result.errors.amountYen).toBe("not_number");
      expect(result.errors.title).toBe("empty");
      expect(result.errors.memo).toBe("too_long");
    }
  });
});

describe("getExpenseItemFieldErrorMessage", () => {
  it.each([
    ["categoryId", "empty", "カテゴリは必須です"],
    ["amountYen", "required", "金額は必須です"],
    ["amountYen", "not_number", "金額は数字のみで入力してください"],
    ["amountYen", "not_positive", "金額は 1 円以上です"],
    [
      "amountYen",
      "too_large",
      `金額は ${EXPENSE_ENTRY_AMOUNT_MAX.toLocaleString("ja-JP")} 円以下です`,
    ],
    ["title", "empty", "内容は必須です"],
    ["title", "too_long", `内容は ${EXPENSE_ENTRY_TITLE_MAX_LENGTH} 文字以内です`],
    ["memo", "too_long", `メモは ${EXPENSE_ENTRY_MEMO_MAX_LENGTH} 文字以内です`],
  ] as const)("%s / %s -> %s", (field, error, expected) => {
    expect(getExpenseItemFieldErrorMessage(field, error)).toBe(expected);
  });
});

describe("validateExpenseItems", () => {
  it("sourceAmount 未指定時は差額チェックをスキップする", () => {
    const result = validateExpenseItems({
      sourceAmount: undefined,
      items: [{ categoryId: "cat-food", amountYen: "1000", title: "食費" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.difference).toBeNull();
      expect(result.data.items).toEqual([
        { categoryId: "cat-food", amountYen: 1000, title: "食費", memo: undefined },
      ]);
    }
  });

  it("差額が 0 の場合 success: true", () => {
    const result = validateExpenseItems({
      sourceAmount: 3000,
      items: [
        { categoryId: "cat-food", amountYen: "1000", title: "食費" },
        { categoryId: "cat-daily", amountYen: "2000", title: "日用品" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.difference).toBe(0);
    }
  });

  it("sourceAmount が項目合計を超えると amount_exceeded", () => {
    const result = validateExpenseItems({
      sourceAmount: 1000,
      items: [
        { categoryId: "cat-food", amountYen: "1000", title: "食費" },
        { categoryId: "cat-daily", amountYen: "500", title: "日用品" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("amount_exceeded");
      if (result.reason === "amount_exceeded") {
        expect(result.difference).toBe(-500);
      }
    }
  });

  it("項目が空の場合 no_items", () => {
    const result = validateExpenseItems({ sourceAmount: 1000, items: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("no_items");
    }
  });

  it("項目にエラーがある場合 item_errors", () => {
    const result = validateExpenseItems({
      sourceAmount: 1000,
      items: [{ categoryId: "", amountYen: "abc", title: "" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("item_errors");
      if (result.reason === "item_errors") {
        expect(result.itemErrors[0]).toEqual({
          categoryId: "empty",
          amountYen: "not_number",
          title: "empty",
        });
      }
    }
  });
});
