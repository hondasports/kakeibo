import { getMonthSummaryWithCategoriesHandler, getYearSummaryHandler } from "./summaries";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { CategoryDoc, ExpenseEntryDoc, ReceiptDoc } from "./testHelpers";
import {
  GROUP_ID,
  OTHER_GROUP_ID,
  USER_ID,
  createIdentity,
  createQueryCtxForSummary,
  otherGroupCategory,
  sampleCategory,
  sampleReceipt,
  otherGroupReceipt,
} from "./testHelpers";

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
