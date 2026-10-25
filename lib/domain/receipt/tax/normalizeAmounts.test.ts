import { describe, expect, it } from "vitest";
import { EXPENSE_ENTRY_AMOUNT_MAX } from "../../expenseEntries/expenseEntryItem";
import { allocateTax } from "./normalizeAmounts";

describe("allocateTax", () => {
  it.each([
    { tax: 32, amounts: [98, 138, 168], expected: [8, 11, 13] },
    { tax: 19, amounts: [132, 108], expected: [10, 9] },
    { tax: 1, amounts: [1, 1, 1], expected: [1, 0, 0] },
    { tax: 2, amounts: [1, 1, 1], expected: [1, 1, 0] },
    { tax: 2, amounts: [1, 5, 16], expected: [0, 1, 1] },
    { tax: 37, amounts: [500, -110], expected: [47, -10] },
    { tax: 0, amounts: [100, -100], expected: [0, 0] },
    { tax: 10, amounts: [], expected: [] },
  ])("印字税額を決定的に配分する: $amounts", ({ tax, amounts, expected }) => {
    expect(
      allocateTax(
        tax,
        amounts.reduce((sum, amount) => sum + amount, 0),
        amounts,
      ),
    ).toEqual(expected);
  });

  it.each([
    { tax: -1, target: 10, amounts: [10] },
    { tax: 0.5, target: 10, amounts: [10] },
    { tax: NaN, target: 10, amounts: [10] },
    { tax: Infinity, target: 10, amounts: [10] },
    { tax: 1, target: 10.5, amounts: [10.5] },
    { tax: 1, target: -10, amounts: [-10] },
    { tax: 1, target: 0, amounts: [0] },
    { tax: 1, target: 10, amounts: [9] },
    { tax: 1, target: 10, amounts: [NaN] },
    { tax: 1, target: 10, amounts: [Infinity] },
    { tax: 1, target: NaN, amounts: [10] },
    { tax: 1, target: Infinity, amounts: [10] },
    { tax: EXPENSE_ENTRY_AMOUNT_MAX + 1, target: 10, amounts: [10] },
    { tax: 1, target: EXPENSE_ENTRY_AMOUNT_MAX + 1, amounts: [EXPENSE_ENTRY_AMOUNT_MAX + 1] },
    { tax: 9_999_998, target: 1, amounts: [2_000_000_000_000_000, 1, -2_000_000_000_000_000] },
    { tax: 2, target: 1, amounts: [EXPENSE_ENTRY_AMOUNT_MAX, 1, -EXPENSE_ENTRY_AMOUNT_MAX] },
  ])("配分条件を満たさない金額は確定しない: $tax / $target", ({ tax, target, amounts }) => {
    expect(allocateTax(tax, target, amounts)).toBeUndefined();
  });

  it("金額上限でも配分は明細数に応じた時間で完了する", () => {
    const amounts = Array.from({ length: 100 }, () => 1);
    const start = performance.now();
    const result = allocateTax(EXPENSE_ENTRY_AMOUNT_MAX, 100, amounts);
    expect(result).toEqual([...Array.from({ length: 99 }, () => 100_000), 99_999]);
    expect(result?.reduce((sum, amount) => sum + amount, 0)).toBe(EXPENSE_ENTRY_AMOUNT_MAX);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
