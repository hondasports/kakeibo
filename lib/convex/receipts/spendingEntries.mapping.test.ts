import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { mapExpenseEntryToSpendingEntry, mapIncomeExpenseEntryToListEntry, mapReceiptToIncomeListEntry, mapReceiptToSpendingEntry } from "./spendingEntries";
import { makeExpenseEntry, makeReceipt } from "./testHelpers";

describe("mapReceiptToSpendingEntry", () => {
  it("支出レシートを SpendingEntry に変換する", () => {
    const receipt = makeReceipt({
      _id: "r1" as Id<"receipts">,
      type: "expense",
      shopName: "コンビニ",
      amountYen: 500,
    });
    expect(mapReceiptToSpendingEntry(receipt)).toEqual({
      _id: "r1",
      date: "2024-01-10",
      type: "expense",
      shopName: "コンビニ",
      bankName: undefined,
      amountYen: 500,
      categoryId: "cat-1",
      memo: undefined,
      recordType: "receipt",
    });
  });

  it("収入レシートを SpendingEntry に変換する", () => {
    const receipt = makeReceipt({
      _id: "r2" as Id<"receipts">,
      type: "income",
      shopName: undefined,
      bankName: "三菱UFJ",
      amountYen: 200000,
    });
    expect(mapReceiptToSpendingEntry(receipt)).toEqual({
      _id: "r2",
      date: "2024-01-10",
      type: "income",
      shopName: undefined,
      bankName: "三菱UFJ",
      amountYen: 200000,
      categoryId: "cat-1",
      memo: undefined,
      recordType: "receipt",
    });
  });

  it("type が undefined のレシートも変換する", () => {
    const receipt = makeReceipt({ _id: "r3" as Id<"receipts">, type: undefined });
    expect(mapReceiptToSpendingEntry(receipt).type).toBeUndefined();
  });
});

describe("mapExpenseEntryToSpendingEntry", () => {
  it("支出エントリを SpendingEntry に変換する", () => {
    const entry = makeExpenseEntry({
      _id: "e1" as Id<"expenseEntries">,
      entryType: "expense",
      title: "スーパー",
      amount: 1500,
    });
    expect(mapExpenseEntryToSpendingEntry(entry)).toEqual({
      _id: "e1",
      date: "2024-01-10",
      type: "expense",
      shopName: "スーパー",
      bankName: undefined,
      amountYen: 1500,
      categoryId: "cat-1",
      memo: undefined,
      recordType: "expenseEntry",
    });
  });

  it("収入エントリを SpendingEntry に変換する", () => {
    const entry = makeExpenseEntry({
      _id: "e2" as Id<"expenseEntries">,
      entryType: "income",
      title: "給与",
      amount: 300000,
      categoryId: "cat-1" as Id<"categories">,
    });
    expect(mapExpenseEntryToSpendingEntry(entry)).toEqual({
      _id: "e2",
      date: "2024-01-10",
      type: "income",
      shopName: undefined,
      bankName: "給与",
      amountYen: 300000,
      categoryId: "cat-1",
      memo: undefined,
      recordType: "expenseEntry",
    });
  });

  it("categoryId が undefined ならエラーを投げる", () => {
    const entry = makeExpenseEntry({
      _id: "e3" as Id<"expenseEntries">,
      categoryId: undefined,
      entryType: "expense",
    });
    expect(() => mapExpenseEntryToSpendingEntry(entry)).toThrow(
      "Expense entry category is required for spending aggregation",
    );
  });
});

describe("mapIncomeExpenseEntryToListEntry", () => {
  it("収入エントリを IncomeListEntry に変換する", () => {
    const entry = makeExpenseEntry({
      _id: "e1" as Id<"expenseEntries">,
      entryType: "income",
      title: "銀行",
      amount: 5000,
    });
    expect(mapIncomeExpenseEntryToListEntry(entry)).toEqual({
      _id: "e1",
      date: "2024-01-10",
      type: "income",
      bankName: "銀行",
      amountYen: 5000,
      memo: undefined,
      recordType: "expenseEntry",
    });
  });
});

describe("mapReceiptToIncomeListEntry", () => {
  it("収入レシートを IncomeListEntry に変換する", () => {
    const receipt = makeReceipt({
      _id: "r1" as Id<"receipts">,
      type: "income",
      bankName: "三菱UFJ",
      amountYen: 100000,
    });
    expect(mapReceiptToIncomeListEntry(receipt)).toEqual({
      _id: "r1",
      date: "2024-01-10",
      type: "income",
      bankName: "三菱UFJ",
      amountYen: 100000,
      memo: undefined,
      recordType: "receipt",
    });
  });
});
