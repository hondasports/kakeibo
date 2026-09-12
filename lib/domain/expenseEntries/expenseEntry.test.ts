import { describe, expect, it } from "vitest";
import { ExpenseEntry } from "./expenseEntry";

const GROUP_ID = "group-001";

describe("ExpenseEntry.createManualExpense", () => {
  it("title を正規化して支出エントリを構築する", () => {
    const entry = ExpenseEntry.createManualExpense(
      {
        groupId: GROUP_ID,
        createdByUserId: "user-1",
        date: "2025-01-10",
        amountYen: 500,
        categoryId: "cat-1",
        title: "  昼食  ",
        memo: "",
      },
      1000,
    );
    const fields = entry.toInsertFields();
    expect(fields.title).toBe("昼食");
    expect(fields.memo).toBeUndefined();
    expect(fields.entryType).toBe("expense");
    expect(fields.source).toBe("manual");
    expect(fields.createdAt).toBe(1000);
  });

  it("不正な金額はエラーになる", () => {
    expect(() =>
      ExpenseEntry.createManualExpense(
        {
          groupId: GROUP_ID,
          createdByUserId: "user-1",
          date: "2025-01-10",
          amountYen: 0,
          categoryId: "cat-1",
          title: "昼食",
        },
        1000,
      ),
    ).toThrow("Amount must be a positive integer");
  });
});

describe("ExpenseEntry.createManualIncome", () => {
  it("収入エントリを構築する", () => {
    const entry = ExpenseEntry.createManualIncome(
      {
        groupId: GROUP_ID,
        createdByUserId: "user-1",
        date: "2025-01-10",
        amountYen: 300000,
        title: "給与",
      },
      1000,
    );
    expect(entry.toInsertFields().entryType).toBe("income");
  });

  it("不正な日付はエラーになる", () => {
    expect(() =>
      ExpenseEntry.createManualIncome(
        {
          groupId: GROUP_ID,
          createdByUserId: "user-1",
          date: "not-a-date",
          amountYen: 1000,
          title: "給与",
        },
        1000,
      ),
    ).toThrow("Date must be a valid YYYY-MM-DD value");
  });
});

describe("ExpenseEntry.buildUpdatePatch", () => {
  const entry = ExpenseEntry.fromPersisted({
    id: "entry-1",
    groupId: GROUP_ID,
    date: "2025-01-10",
    amount: 500,
    categoryId: "cat-1",
    title: "昼食",
    entryType: "expense",
    source: "manual",
    createdAt: 1000,
    updatedAt: 1000,
  });

  it("指定フィールドのみを patch に含める", () => {
    const patch = entry.buildUpdatePatch({ title: "  夕食  " });
    expect(patch).toEqual({ title: "夕食" });
  });

  it("不正な値はエラーになり patch を生成しない", () => {
    expect(() => entry.buildUpdatePatch({ amountYen: -1 })).toThrow(
      "Amount must be a positive integer",
    );
    expect(() => entry.buildUpdatePatch({ memo: "x".repeat(501) })).toThrow(
      "Memo must be 500 characters or less",
    );
  });
});

describe("ExpenseEntry 所有権・種別の知識", () => {
  it("belongsToGroup で所有権を判定する", () => {
    const entry = ExpenseEntry.fromPersisted({
      id: "entry-1",
      groupId: GROUP_ID,
      date: "2025-01-10",
      amount: 500,
      title: "昼食",
      entryType: "expense",
      source: "manual",
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(entry.belongsToGroup(GROUP_ID)).toBe(true);
    expect(entry.belongsToGroup("other-group")).toBe(false);
    expect(entry.isSpendingRecord()).toBe(true);
  });

  it("収入エントリは一括支出操作の対象外", () => {
    const income = ExpenseEntry.fromPersisted({
      id: "entry-2",
      groupId: GROUP_ID,
      date: "2025-01-10",
      amount: 1000,
      title: "給与",
      entryType: "income",
      source: "manual",
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(income.isSpendingRecord()).toBe(false);
  });
});
