import { getDailySpendingTrendHandler, getMonthlyExpensesSummaryHandler } from "./summaries";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { UserDoc, ExpenseEntryDoc, ReceiptDoc } from "./testHelpers";
import { GROUP_ID, USER_ID, createIdentity, createQueryCtx, createQueryCtxForMonthlySummary } from "./testHelpers";

describe("getMonthlyExpensesSummary", () => {
  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtxForMonthlySummary(null, [], null);

    await expect(
      getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-01" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-01" }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });

  it("receipt.date ベースで月次集計される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-jan-1",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-02-01",
        shopName: "スーパーA",
        amountYen: 1000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-29", // 2024-02 に属する
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "r-jan-2",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-02-20",
        shopName: "コンビニB",
        amountYen: 500,
        categoryId: "cat-001",
        weekStartDate: "2024-02-19", // 2024-02 に属する
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createQueryCtxForMonthlySummary(identity, receiptDocs, null);

    const result = await getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-02" });

    expect(result.totalExpensesYen).toBe(1500);
    expect(result.monthlyIncome).toBeNull();
    expect(result.remainingBalanceYen).toBeNull();
  });

  it("別月のレシートは含まれない", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-jan",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        shopName: "スーパーA",
        amountYen: 1000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08", // 2024-01
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "r-feb",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-02-05",
        shopName: "コンビニB",
        amountYen: 2000,
        categoryId: "cat-001",
        weekStartDate: "2024-02-05", // 2024-02 → 除外
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createQueryCtxForMonthlySummary(identity, receiptDocs, null);

    const result = await getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-01" });

    expect(result.totalExpensesYen).toBe(1000); // janのみ
  });

  it("income のレシートは月次集計から除外される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-expense",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        shopName: "スーパーA",
        amountYen: 1000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "r-income",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-15",
        type: "income",
        bankName: "給与",
        amountYen: 50000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-15",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createQueryCtxForMonthlySummary(identity, receiptDocs, null);

    const result = await getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-01" });

    expect(result.totalExpensesYen).toBe(1000);
  });

  it("monthlyIncome が設定されている場合の残金計算", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-1",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 50000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const userDoc: UserDoc = {
      _id: "user-001",
      _creationTime: 1000,
      userId: USER_ID,
      displayName: "テストユーザー",
      monthlyIncome: 300000,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForMonthlySummary(identity, receiptDocs, userDoc);

    const result = await getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-01" });

    expect(result.totalExpensesYen).toBe(50000);
    expect(result.monthlyIncome).toBe(300000);
    expect(result.remainingBalanceYen).toBe(250000);
  });

  it("monthlyIncome が null の場合は remainingBalance も null", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const userDoc: UserDoc = {
      _id: "user-001",
      _creationTime: 1000,
      userId: USER_ID,
      displayName: "テストユーザー",
      // monthlyIncome なし
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForMonthlySummary(identity, [], userDoc);

    const result = await getMonthlyExpensesSummaryHandler(ctx, { monthStartDate: "2024-01" });

    expect(result.monthlyIncome).toBeNull();
    expect(result.remainingBalanceYen).toBeNull();
  });
});

describe("getDailySpendingTrendHandler", () => {
  it("今週と前週の各日の合計支出が正しく返る", async () => {
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r1",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-08",
        shopName: "shop-A",
        amountYen: 1000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "r2",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-01-10",
        shopName: "shop-B",
        amountYen: 2000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1001,
        updatedAt: 1001,
      },
      {
        _id: "r-income",
        _creationTime: 1005,
        groupId: GROUP_ID,
        date: "2024-01-10",
        type: "income",
        bankName: "給与",
        amountYen: 9999,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1005,
        updatedAt: 1005,
      },
      {
        _id: "r3",
        _creationTime: 1002,
        groupId: GROUP_ID,
        date: "2024-01-12",
        shopName: "shop-C",
        amountYen: 500,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1002,
        updatedAt: 1002,
      },
      {
        _id: "r4",
        _creationTime: 1003,
        groupId: GROUP_ID,
        date: "2024-01-01",
        shopName: "shop-D",
        amountYen: 3000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-01",
        createdAt: 1003,
        updatedAt: 1003,
      },
      {
        _id: "r5",
        _creationTime: 1004,
        groupId: GROUP_ID,
        date: "2024-01-03",
        shopName: "shop-E",
        amountYen: 1500,
        categoryId: "cat-001",
        weekStartDate: "2024-01-01",
        createdAt: 1004,
        updatedAt: 1004,
      },
    ];

    const ctx = createQueryCtx(createIdentity(), receiptDocs);
    const result = await getDailySpendingTrendHandler(ctx, { weekStartDate: "2024-01-08" });

    expect(result.currentWeek).toHaveLength(7);
    expect(result.previousWeek).toHaveLength(7);

    expect(result.currentWeek[0]).toEqual({ date: "2024-01-08", totalAmountYen: 1000 });
    expect(result.currentWeek[1]).toEqual({ date: "2024-01-09", totalAmountYen: 0 });
    expect(result.currentWeek[2]).toEqual({ date: "2024-01-10", totalAmountYen: 2000 });
    expect(result.currentWeek[3]).toEqual({ date: "2024-01-11", totalAmountYen: 0 });
    expect(result.currentWeek[4]).toEqual({ date: "2024-01-12", totalAmountYen: 500 });
    expect(result.currentWeek[5]).toEqual({ date: "2024-01-13", totalAmountYen: 0 });
    expect(result.currentWeek[6]).toEqual({ date: "2024-01-14", totalAmountYen: 0 });

    expect(result.previousWeek[0]).toEqual({ date: "2024-01-01", totalAmountYen: 3000 });
    expect(result.previousWeek[1]).toEqual({ date: "2024-01-02", totalAmountYen: 0 });
    expect(result.previousWeek[2]).toEqual({ date: "2024-01-03", totalAmountYen: 1500 });
    expect(result.previousWeek[3]).toEqual({ date: "2024-01-04", totalAmountYen: 0 });
    expect(result.previousWeek[4]).toEqual({ date: "2024-01-05", totalAmountYen: 0 });
    expect(result.previousWeek[5]).toEqual({ date: "2024-01-06", totalAmountYen: 0 });
    expect(result.previousWeek[6]).toEqual({ date: "2024-01-07", totalAmountYen: 0 });
  });

  it("レシートなしの場合は全て0を返す", async () => {
    const ctx = createQueryCtx(createIdentity(), []);
    const result = await getDailySpendingTrendHandler(ctx, { weekStartDate: "2024-01-08" });

    expect(result.currentWeek).toHaveLength(7);
    expect(result.previousWeek).toHaveLength(7);
    result.currentWeek.forEach((d) => expect(d.totalAmountYen).toBe(0));
    result.previousWeek.forEach((d) => expect(d.totalAmountYen).toBe(0));
  });

  it("expenseEntries があるときは日別推移も expenseEntries ベースで返る", async () => {
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-1",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-08",
        amount: 1000,
        categoryId: "cat-food",
        title: "スーパーA",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "entry-2",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-01-10",
        amount: 2000,
        categoryId: "cat-daily",
        title: "ドラッグストアB",
        entryType: "expense",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
      {
        _id: "entry-3",
        _creationTime: 1002,
        groupId: GROUP_ID,
        date: "2024-01-01",
        amount: 3000,
        categoryId: "cat-food",
        title: "スーパーC",
        entryType: "expense",
        source: "manual",
        createdAt: 1002,
        updatedAt: 1002,
      },
    ];
    const ctx = createQueryCtx(createIdentity(), [], expenseEntries);
    const result = await getDailySpendingTrendHandler(ctx, { weekStartDate: "2024-01-08" });

    expect(result.currentWeek[0]).toEqual({ date: "2024-01-08", totalAmountYen: 1000 });
    expect(result.currentWeek[2]).toEqual({ date: "2024-01-10", totalAmountYen: 2000 });
    expect(result.previousWeek[0]).toEqual({ date: "2024-01-01", totalAmountYen: 3000 });
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtx(null, []);

    await expect(
      getDailySpendingTrendHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});
