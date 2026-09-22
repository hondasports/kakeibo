import {
  getDailySpendingTrendHandler,
  getMonthSummaryWithCategoriesHandler,
  getMonthlyExpensesSummaryHandler,
  getYearSummaryHandler,
} from "./summaries";
import {
  CategoryDoc,
  UserDoc,
  ExpenseEntryDoc,
  GROUP_ID,
  OTHER_GROUP_ID,
  ReceiptDoc,
  USER_ID,
  createIdentity,
  createQueryCtx,
  createQueryCtxForMonthlySummary,
  createQueryCtxForSummary,
  otherGroupCategory,
  sampleCategory,
  sampleReceipt,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

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

// ---------------------------------------------------------------------------
// getDailySpendingTrend
// ---------------------------------------------------------------------------

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

describe("getMonthSummaryWithCategoriesHandler", () => {
  it("未認証の場合は月次サマリーを返さない", async () => {
    await expect(
      getMonthSummaryWithCategoriesHandler(createQueryCtxForSummary(null), { month: "2024-02" }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("支出・収入・差引・カテゴリを expenseEntries から集計する", async () => {
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-expense",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-02-01",
        amount: 2000,
        categoryId: sampleCategory._id,
        title: "スーパー",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "entry-income",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-02-29",
        amount: 50000,
        categoryId: sampleCategory._id,
        title: "給与",
        entryType: "income",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
    ];
    const legacyReceipts: ReceiptDoc[] = [
      {
        ...sampleReceipt,
        _id: "legacy-expense",
        date: "2024-02-15",
        amountYen: 999,
      },
      {
        ...sampleReceipt,
        _id: "legacy-income",
        date: "2024-02-20",
        type: "income",
        bankName: "旧口座",
        shopName: undefined,
        amountYen: 9999,
      },
    ];

    const result = await getMonthSummaryWithCategoriesHandler(
      createQueryCtxForSummary(
        createIdentity({ tokenIdentifier: USER_ID }),
        legacyReceipts,
        [sampleCategory],
        expenseEntries,
      ),
      { month: "2024-02" },
    );

    expect(result.totalAmountYen).toBe(2000);
    expect(result.totalIncomeYen).toBe(50000);
    expect(result.netAmountYen).toBe(48000);
    expect(result.count).toBe(1);
    expect(result.incomeCount).toBe(1);
    expect(result.receipts.map((receipt) => receipt._id)).toEqual(["entry-expense"]);
    expect(result.incomes.map((income) => income._id)).toEqual(["entry-income"]);
    expect(result.byCategory).toEqual([
      {
        categoryId: sampleCategory._id,
        categoryName: sampleCategory.name,
        categoryColor: sampleCategory.color,
        totalAmountYen: 2000,
        count: 1,
      },
    ]);
  });

  it("複数カテゴリとマイナス差引を正しく集計する", async () => {
    const transportCategory: CategoryDoc = {
      ...sampleCategory,
      _id: "cat-002",
      name: "交通費",
      color: "#4F7CAC",
      sortOrder: 2,
    };
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "food-1",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-02-10",
        amount: 4000,
        categoryId: sampleCategory._id,
        title: "食料品1",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "food-2",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-02-11",
        amount: 1000,
        categoryId: sampleCategory._id,
        title: "食料品2",
        entryType: "expense",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
      {
        _id: "transport-1",
        _creationTime: 1002,
        groupId: GROUP_ID,
        date: "2024-02-12",
        amount: 1500,
        categoryId: transportCategory._id,
        title: "電車",
        entryType: "expense",
        source: "manual",
        createdAt: 1002,
        updatedAt: 1002,
      },
      {
        _id: "income-1",
        _creationTime: 1003,
        groupId: GROUP_ID,
        date: "2024-02-29",
        amount: 3000,
        categoryId: sampleCategory._id,
        title: "給料",
        entryType: "income",
        source: "manual",
        createdAt: 1003,
        updatedAt: 1003,
      },
    ];

    const result = await getMonthSummaryWithCategoriesHandler(
      createQueryCtxForSummary(
        createIdentity({ tokenIdentifier: USER_ID }),
        [],
        [sampleCategory, transportCategory],
        expenseEntries,
      ),
      { month: "2024-02" },
    );

    expect(result.totalAmountYen).toBe(6500);
    expect(result.totalIncomeYen).toBe(3000);
    expect(result.netAmountYen).toBe(-3500);
    expect(result.byCategory).toEqual([
      {
        categoryId: sampleCategory._id,
        categoryName: sampleCategory.name,
        categoryColor: sampleCategory.color,
        totalAmountYen: 5000,
        count: 2,
      },
      {
        categoryId: transportCategory._id,
        categoryName: transportCategory.name,
        categoryColor: transportCategory.color,
        totalAmountYen: 1500,
        count: 1,
      },
    ]);
  });

  it("カテゴリが削除済みでも不明カテゴリとして集計する", async () => {
    const expenseEntry: ExpenseEntryDoc = {
      _id: "missing-category-entry",
      _creationTime: 1000,
      groupId: GROUP_ID,
      date: "2024-02-10",
      amount: 1200,
      categoryId: "missing-category",
      title: "カテゴリなし支出",
      entryType: "expense",
      source: "manual",
      createdAt: 1000,
      updatedAt: 1000,
    };

    const result = await getMonthSummaryWithCategoriesHandler(
      createQueryCtxForSummary(
        createIdentity({ tokenIdentifier: USER_ID }),
        [],
        [],
        [expenseEntry],
      ),
      { month: "2024-02" },
    );

    expect(result.receipts[0]).toMatchObject({
      categoryId: "missing-category",
      categoryName: "不明",
      categoryColor: "#AAB7C4",
    });
    expect(result.byCategory).toEqual([
      {
        categoryId: "missing-category",
        categoryName: "不明",
        categoryColor: "#AAB7C4",
        totalAmountYen: 1200,
        count: 1,
      },
    ]);
  });

  it("expenseEntries がない場合は旧 receipts の月初・月末を集計する", async () => {
    const receipts: ReceiptDoc[] = [
      { ...sampleReceipt, _id: "month-start", date: "2024-02-01", amountYen: 1000 },
      { ...sampleReceipt, _id: "month-end", date: "2024-02-29", amountYen: 2000 },
      { ...sampleReceipt, _id: "next-month", date: "2024-03-01", amountYen: 4000 },
    ];

    const result = await getMonthSummaryWithCategoriesHandler(
      createQueryCtxForSummary(createIdentity({ tokenIdentifier: USER_ID }), receipts, [
        sampleCategory,
      ]),
      { month: "2024-02" },
    );

    expect(result.totalAmountYen).toBe(3000);
    expect(result.count).toBe(2);
    expect(result.receipts.map((receipt) => receipt._id)).toEqual(["month-start", "month-end"]);
  });

  it("アクティブグループ以外のデータを月次集計に含めない", async () => {
    const otherGroupReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "other-group-receipt",
      groupId: OTHER_GROUP_ID,
      date: "2024-02-15",
      amountYen: 9999,
    };

    const result = await getMonthSummaryWithCategoriesHandler(
      createQueryCtxForSummary(
        createIdentity({ tokenIdentifier: USER_ID }),
        [otherGroupReceipt],
        [otherGroupCategory],
      ),
      { month: "2024-02" },
    );

    expect(result).toMatchObject({
      count: 0,
      totalAmountYen: 0,
      totalIncomeYen: 0,
      netAmountYen: 0,
      incomeCount: 0,
      byCategory: [],
      receipts: [],
      incomes: [],
    });
  });

  it("対象月にデータがなければ空のサマリーを返す", async () => {
    const result = await getMonthSummaryWithCategoriesHandler(
      createQueryCtxForSummary(createIdentity({ tokenIdentifier: USER_ID })),
      { month: "2024-02" },
    );

    expect(result).toEqual({
      count: 0,
      totalAmountYen: 0,
      totalIncomeYen: 0,
      netAmountYen: 0,
      incomeCount: 0,
      byCategory: [],
      receipts: [],
      incomes: [],
    });
  });

  it("不正な年月を拒否する", async () => {
    await expect(
      getMonthSummaryWithCategoriesHandler(
        createQueryCtxForSummary(createIdentity({ tokenIdentifier: USER_ID })),
        { month: "2024-13" },
      ),
    ).rejects.toMatchObject({ data: "Invalid month" });
  });
});

describe("getYearSummaryHandler", () => {
  it("未認証の場合は年次サマリーを返さない", async () => {
    await expect(
      getYearSummaryHandler(createQueryCtxForSummary(null), { year: "2024" }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("月ごとの収支とカテゴリ積み上げを年単位で集計する", async () => {
    const utilitiesCategory: CategoryDoc = {
      ...sampleCategory,
      _id: "cat-002",
      name: "光熱費",
      color: "#4F7CAC",
      sortOrder: 2,
    };
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "jan-food",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        amount: 1200,
        categoryId: sampleCategory._id,
        title: "食費",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "aug-utilities",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-08-15",
        amount: 8000,
        categoryId: utilitiesCategory._id,
        title: "電気代",
        entryType: "expense",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
      {
        _id: "aug-income",
        _creationTime: 1002,
        groupId: GROUP_ID,
        date: "2024-08-25",
        amount: 200000,
        categoryId: sampleCategory._id,
        title: "給与",
        entryType: "income",
        source: "manual",
        createdAt: 1002,
        updatedAt: 1002,
      },
    ];

    const result = await getYearSummaryHandler(
      createQueryCtxForSummary(
        createIdentity({ tokenIdentifier: USER_ID }),
        [],
        [sampleCategory, utilitiesCategory],
        expenseEntries,
      ),
      { year: "2024" },
    );

    expect(result.year).toBe("2024");
    expect(result.months).toHaveLength(12);
    expect(result.totalAmountYen).toBe(9200);
    expect(result.totalIncomeYen).toBe(200000);
    expect(result.netAmountYen).toBe(190800);
    expect(result.months[0]).toMatchObject({
      month: "2024-01",
      totalAmountYen: 1200,
      totalIncomeYen: 0,
    });
    expect(result.months[7]).toMatchObject({
      month: "2024-08",
      totalAmountYen: 8000,
      totalIncomeYen: 200000,
    });
    expect(result.byCategory.map((category) => category.categoryName)).toEqual(["光熱費", "食費"]);
  });

  it("データが無い年は0で埋めた12ヶ月を返す", async () => {
    const result = await getYearSummaryHandler(
      createQueryCtxForSummary(createIdentity({ tokenIdentifier: USER_ID })),
      { year: "2023" },
    );

    expect(result.months).toHaveLength(12);
    expect(result.totalAmountYen).toBe(0);
    expect(result.totalIncomeYen).toBe(0);
    expect(result.byCategory).toEqual([]);
  });

  it("不正な年を拒否する", async () => {
    await expect(
      getYearSummaryHandler(
        createQueryCtxForSummary(createIdentity({ tokenIdentifier: USER_ID })),
        {
          year: "24",
        },
      ),
    ).rejects.toMatchObject({ data: "Invalid year" });
  });
});
