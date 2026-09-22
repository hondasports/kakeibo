import { getReceiptsByDateHandler, getReceiptsByWeekHandler } from "./crud";
import {
  getFourWeeksSummaryHandler,
  getWeekSummaryHandler,
  getWeekSummaryWithCategoriesHandler,
} from "./summaries";
import {
  CategoryDoc,
  ExpenseEntryDoc,
  GROUP_ID,
  OTHER_GROUP_ID,
  OTHER_USER_ID,
  ReceiptDoc,
  USER_ID,
  createIdentity,
  createQueryCtx,
  createQueryCtxForSummary,
  sampleCategory,
  sampleReceipt,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

describe("getReceiptsByWeek", () => {
  it("正常系: 指定週のレシートが返される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const docs = [sampleReceipt];
    const ctx = createQueryCtx(identity, docs);

    const result = await getReceiptsByWeekHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual(docs);
  });

  it("別グループのレシートが返らない", async () => {
    const identity = createIdentity({ tokenIdentifier: OTHER_USER_ID });
    // OTHER_GROUP_ID のコンテキストでは queryDocs を空にして別グループのデータが混入しないことを表現
    const ctx = createQueryCtx(identity, [], [], OTHER_GROUP_ID);

    const result = await getReceiptsByWeekHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    // GROUP_ID のレシートは含まれない
    expect(result).not.toContainEqual(expect.objectContaining({ groupId: GROUP_ID }));
    expect(result).toHaveLength(0);
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtx(null);

    await expect(
      getReceiptsByWeekHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      getReceiptsByWeekHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });
});

// ---------------------------------------------------------------------------
// getReceiptsByDate テスト
// ---------------------------------------------------------------------------

describe("getReceiptsByDate", () => {
  it("正常系: 指定日のレシートが返される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const docs = [sampleReceipt];
    const ctx = createQueryCtx(identity, docs);

    const result = await getReceiptsByDateHandler(ctx, { date: "2024-01-10" });

    expect(result).toEqual(docs);
  });
});

// ---------------------------------------------------------------------------
// updateReceipt テスト
// ---------------------------------------------------------------------------

describe("getWeekSummary", () => {
  it("レシートが0件のとき: 空の集計と前週データなしを返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createQueryCtx(identity, []);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual({
      count: 0,
      totalAmountYen: 0,
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
    });
  });

  it("複数レシートがあるとき: 件数と合計金額を正しく返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receipt1: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-001",
      amountYen: 1500,
    };
    const receipt2: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-002",
      amountYen: 800,
    };
    const docs = [receipt1, receipt2];
    const ctx = createQueryCtx(identity, docs);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual({
      count: 2,
      totalAmountYen: 2300,
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
    });
  });

  it("expenseEntries があるときは receipts ではなく expenseEntries を集計する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "legacy-receipt",
      amountYen: 1500,
    };
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-001",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        amount: 4280,
        categoryId: "cat-food",
        title: "スーパー北浜",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "entry-002",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-01-11",
        amount: 2000,
        categoryId: "cat-daily",
        title: "ドラッグストア南",
        entryType: "expense",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
      {
        _id: "entry-003",
        _creationTime: 1002,
        groupId: GROUP_ID,
        date: "2024-01-11",
        amount: 9999,
        categoryId: "cat-daily",
        title: "給与",
        entryType: "income",
        source: "manual",
        createdAt: 1002,
        updatedAt: 1002,
      },
    ];
    const ctx = createQueryCtx(identity, [receipt], expenseEntries);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual({
      count: 2,
      totalAmountYen: 6280,
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
    });
  });

  it("expenseEntries が 500 件を超えても全件を集計する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const expenseEntries: ExpenseEntryDoc[] = Array.from({ length: 501 }, (_, index) => ({
      _id: `entry-${String(index + 1).padStart(3, "0")}`,
      _creationTime: 1000 + index,
      groupId: GROUP_ID,
      date: "2024-01-10",
      amount: 1,
      categoryId: "cat-daily",
      title: `明細${index + 1}`,
      entryType: "expense",
      source: "manual",
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
    }));
    const ctx = createQueryCtx(identity, [], expenseEntries);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.count).toBe(501);
    expect(result.totalAmountYen).toBe(501);
  });

  it("開始曜日を変更した週でもレシートの実日付で集計する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-custom-week",
      date: "2024-01-14",
      amountYen: 3200,
      // 旧設定（月曜始まり）で保存された値でも、水曜始まりの週に含める。
      weekStartDate: "2024-01-08",
    };
    const ctx = createQueryCtx(identity, [receipt]);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-10",
    });

    expect(result).toEqual({
      count: 1,
      totalAmountYen: 3200,
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
    });
  });

  it("前週レシートがあるとき: 前週件数と合計金額を返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const currentReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-current",
      amountYen: 2300,
      weekStartDate: "2024-01-08",
    };
    const prevReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-prev",
      date: "2024-01-03",
      amountYen: 5000,
      weekStartDate: "2024-01-01",
    };
    const ctx = createQueryCtx(identity, [currentReceipt, prevReceipt]);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual({
      count: 1,
      totalAmountYen: 2300,
      prevWeekReceiptCount: 1,
      prevWeekTotalAmountYen: 5000,
    });
  });

  it("前週レシートが201件以上あるときも全件を集計する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const currentReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-current",
      amountYen: 1000,
      weekStartDate: "2024-01-08",
    };
    const prevReceipts: ReceiptDoc[] = Array.from({ length: 201 }, (_, index) => ({
      ...sampleReceipt,
      _id: `receipt-prev-${index}`,
      date: "2024-01-03",
      amountYen: 100,
      weekStartDate: "2024-01-01",
    }));
    const ctx = createQueryCtx(identity, [currentReceipt, ...prevReceipts]);

    const result = await getWeekSummaryHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.prevWeekReceiptCount).toBe(201);
    expect(result.prevWeekTotalAmountYen).toBe(20100);
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtx(null);

    await expect(
      getWeekSummaryHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(getWeekSummaryHandler(ctx, { weekStartDate: "2024-01-08" })).rejects.toMatchObject(
      { data: "Not authenticated" },
    );
  });
});

// ---------------------------------------------------------------------------
// getWeekSummaryWithCategories テスト
// ---------------------------------------------------------------------------

describe("getWeekSummaryWithCategories", () => {
  it("レシートが0件のとき: 空の集計を返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createQueryCtxForSummary(identity, [], []);

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual({
      count: 0,
      totalAmountYen: 0,
      totalIncomeYen: 0,
      incomeCount: 0,
      byCategory: [],
      prevWeekReceiptCount: 0,
      prevWeekTotalAmountYen: null,
      receipts: [],
      incomes: [],
    });
  });

  it("収入の expenseEntries が週次サマリーに含まれ、支出集計には混入しない", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-expense-001",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        amount: 1500,
        categoryId: "cat-001",
        title: "スーパー",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "entry-income-001",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-01-11",
        amount: 300000,
        categoryId: "cat-001",
        title: "給与",
        entryType: "income",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
    ];
    const ctx = createQueryCtxForSummary(identity, [], [sampleCategory], expenseEntries);

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.count).toBe(1);
    expect(result.totalAmountYen).toBe(1500);
    expect(result.totalIncomeYen).toBe(300000);
    expect(result.incomeCount).toBe(1);
    expect(result.incomes).toEqual([
      {
        _id: "entry-income-001",
        date: "2024-01-11",
        type: "income",
        bankName: "給与",
        amountYen: 300000,
        recordType: "expenseEntry",
      },
    ]);
  });

  it("expenseEntries 収入がない週はレガシー receipts 収入をフォールバックする", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const legacyIncomeReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-income-001",
      type: "income",
      bankName: "給与振込",
      amountYen: 250000,
      shopName: undefined,
    };
    const ctx = createQueryCtxForSummary(identity, [legacyIncomeReceipt], [sampleCategory], []);

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.totalIncomeYen).toBe(250000);
    expect(result.incomeCount).toBe(1);
    expect(result.incomes[0]).toMatchObject({
      _id: "receipt-income-001",
      type: "income",
      bankName: "給与振込",
      amountYen: 250000,
      recordType: "receipt",
    });
  });

  it("expenseEntries が存在する週ではレガシー receipts 収入を返さない", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-expense-only",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        amount: 1000,
        categoryId: "cat-001",
        title: "コンビニ",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const legacyIncomeReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-income-legacy",
      type: "income",
      bankName: "賞与",
      amountYen: 50000,
      shopName: undefined,
    };
    const ctx = createQueryCtxForSummary(
      identity,
      [legacyIncomeReceipt],
      [sampleCategory],
      expenseEntries,
    );

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.totalIncomeYen).toBe(0);
    expect(result.incomeCount).toBe(0);
    expect(result.incomes).toEqual([]);
  });

  it("単一カテゴリのレシートがあるとき: カテゴリ別集計が返る", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receipt1: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-001",
      amountYen: 1500,
      categoryId: "cat-001",
    };
    const receipt2: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-002",
      amountYen: 800,
      categoryId: "cat-001",
    };
    const ctx = createQueryCtxForSummary(identity, [receipt1, receipt2], [sampleCategory]);

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.count).toBe(2);
    expect(result.totalAmountYen).toBe(2300);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0]).toMatchObject({
      categoryId: "cat-001",
      categoryName: "食費",
      categoryColor: "#8B5E3C",
      totalAmountYen: 2300,
      count: 2,
    });
    expect(result.receipts).toHaveLength(2);
  });

  it("複数カテゴリのレシートがあるとき: カテゴリごとに集計される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const category2: CategoryDoc = {
      _id: "cat-002",
      _creationTime: 1000,
      groupId: GROUP_ID,
      name: "外食",
      color: "#F4A27A",
      isActive: true,
      sortOrder: 2,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const receipt1: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-001",
      amountYen: 1500,
      categoryId: "cat-001",
    };
    const receipt2: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-002",
      amountYen: 3000,
      categoryId: "cat-002",
    };
    const ctx = createQueryCtxForSummary(
      identity,
      [receipt1, receipt2],
      [sampleCategory, category2],
    );

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.count).toBe(2);
    expect(result.totalAmountYen).toBe(4500);
    expect(result.byCategory).toHaveLength(2);
    // 金額降順でソートされていること
    expect(result.byCategory[0].totalAmountYen).toBeGreaterThanOrEqual(
      result.byCategory[1].totalAmountYen,
    );
  });

  it("expenseEntries があるときはカテゴリ別集計を expenseEntries ベースで返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const legacyReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "legacy-receipt",
      amountYen: 1500,
    };
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-food",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-10",
        amount: 4280,
        categoryId: "cat-food",
        title: "スーパー北浜",
        entryType: "expense",
        source: "manual",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "entry-daily",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-01-11",
        amount: 2000,
        categoryId: "cat-daily",
        title: "ドラッグストア南",
        entryType: "expense",
        source: "manual",
        createdAt: 1001,
        updatedAt: 1001,
      },
    ];
    const category2: CategoryDoc = {
      _id: "cat-daily",
      _creationTime: 1000,
      groupId: GROUP_ID,
      name: "日用品",
      color: "#A6B28B",
      isActive: true,
      sortOrder: 2,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForSummary(
      identity,
      [legacyReceipt],
      [
        {
          ...sampleCategory,
          _id: "cat-food",
          name: "食費",
          color: "#AAB7C4",
        },
        category2,
      ],
      expenseEntries,
    );

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.count).toBe(2);
    expect(result.totalAmountYen).toBe(6280);
    expect(result.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#AAB7C4",
          totalAmountYen: 4280,
          count: 1,
        }),
        expect.objectContaining({
          categoryId: "cat-daily",
          categoryName: "日用品",
          categoryColor: "#A6B28B",
          totalAmountYen: 2000,
          count: 1,
        }),
      ]),
    );
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0]).toMatchObject({
      categoryName: "食費",
      categoryColor: "#AAB7C4",
      amountYen: 4280,
    });
  });

  it("AI下書き由来のカテゴリ別expenseEntriesが週次カテゴリ別集計に反映される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const expenseEntries: ExpenseEntryDoc[] = [
      {
        _id: "entry-ai-food-1",
        _creationTime: 1000,
        groupId: GROUP_ID,
        aiExpenseDraftId: "draft-ai-receipt",
        date: "2024-01-10",
        amount: 400,
        categoryId: "cat-food",
        title: "ドラッグストアA",
        entryType: "expense",
        source: "ai_suggested",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "entry-ai-medical",
        _creationTime: 1001,
        groupId: GROUP_ID,
        aiExpenseDraftId: "draft-ai-receipt",
        date: "2024-01-10",
        amount: 980,
        categoryId: "cat-medical",
        title: "ドラッグストアA",
        entryType: "expense",
        source: "ai_suggested",
        createdAt: 1001,
        updatedAt: 1001,
      },
    ];
    const foodCategory: CategoryDoc = {
      ...sampleCategory,
      _id: "cat-food",
      name: "食費",
      color: "#AAB7C4",
    };
    const medicalCategory: CategoryDoc = {
      ...sampleCategory,
      _id: "cat-medical",
      name: "医療費",
      color: "#C4AAB7",
      sortOrder: 2,
    };
    const ctx = createQueryCtxForSummary(
      identity,
      [],
      [foodCategory, medicalCategory],
      expenseEntries,
    );

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.totalAmountYen).toBe(1380);
    expect(result.count).toBe(2);
    expect(result.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: "cat-food",
          categoryName: "食費",
          totalAmountYen: 400,
        }),
        expect.objectContaining({
          categoryId: "cat-medical",
          categoryName: "医療費",
          totalAmountYen: 980,
        }),
      ]),
    );
    expect(result.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: "entry-ai-food-1",
          amountYen: 400,
          categoryName: "食費",
          shopName: "ドラッグストアA",
        }),
        expect.objectContaining({
          _id: "entry-ai-medical",
          amountYen: 980,
          categoryName: "医療費",
          shopName: "ドラッグストアA",
        }),
      ]),
    );
  });

  it("前週レシートがあるとき: prevWeekTotalAmountYen が含まれる", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const receipt1: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-001",
      amountYen: 1000,
      categoryId: "cat-001",
      weekStartDate: "2024-01-08",
    };
    const prevReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-prev",
      date: "2024-01-03",
      amountYen: 5000,
      categoryId: "cat-001",
      weekStartDate: "2024-01-01",
    };
    const ctx = createQueryCtxForSummary(identity, [receipt1, prevReceipt], [sampleCategory]);

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.prevWeekReceiptCount).toBe(1);
    expect(result.prevWeekTotalAmountYen).toBe(5000);
  });

  it("無効化済みカテゴリを参照する既存レシートでもカテゴリ名と色を返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const inactiveCategory: CategoryDoc = {
      ...sampleCategory,
      _id: "cat-inactive",
      name: "旧カテゴリ",
      color: "#765F4F",
      isActive: false,
    };
    const receipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-inactive-category",
      categoryId: "cat-inactive",
    };
    const ctx = createQueryCtxForSummary(identity, [receipt], [inactiveCategory]);

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.byCategory).toEqual([
      {
        categoryId: "cat-inactive",
        categoryName: "旧カテゴリ",
        categoryColor: "#765F4F",
        totalAmountYen: 1500,
        count: 1,
      },
    ]);
    expect(result.receipts[0]).toMatchObject({
      categoryId: "cat-inactive",
      categoryName: "旧カテゴリ",
      categoryColor: "#765F4F",
    });
  });

  it("101件目以降のカテゴリを参照する既存レシートでもカテゴリ名と色を返す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const targetCategory: CategoryDoc = {
      ...sampleCategory,
      _id: "cat-target-over-100",
      name: "101件目カテゴリ",
      color: "#8B5E3C",
      sortOrder: 101,
    };
    const firstOneHundredCategories = Array.from({ length: 100 }, (_, index) => ({
      ...sampleCategory,
      _id: `cat-${String(index + 1).padStart(3, "0")}`,
      name: `カテゴリ${index + 1}`,
      sortOrder: index + 1,
    }));
    const receipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "receipt-over-100-category",
      categoryId: "cat-target-over-100",
    };
    const ctx = createQueryCtxForSummary(
      identity,
      [receipt],
      [...firstOneHundredCategories, targetCategory],
    );

    const result = await getWeekSummaryWithCategoriesHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result.receipts[0]).toMatchObject({
      categoryId: "cat-target-over-100",
      categoryName: "101件目カテゴリ",
      categoryColor: "#8B5E3C",
    });
    expect(result.byCategory[0]).toMatchObject({
      categoryId: "cat-target-over-100",
      categoryName: "101件目カテゴリ",
      categoryColor: "#8B5E3C",
    });
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtxForSummary(null, [], []);

    await expect(
      getWeekSummaryWithCategoriesHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      getWeekSummaryWithCategoriesHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });
});

// ---------------------------------------------------------------------------
// getFourWeeksSummary
// ---------------------------------------------------------------------------

describe("getFourWeeksSummaryHandler", () => {
  it("基準週を含む直近4週の合計支出を古い順で返す", async () => {
    // 2024-01-08（月）を基準週とし、そこから3週前まで4週分のレシートを用意
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-w0-1",
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
        _id: "r-w0-2",
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
        _id: "r-w1",
        _creationTime: 1002,
        groupId: GROUP_ID,
        date: "2024-01-01",
        shopName: "shop-C",
        amountYen: 500,
        categoryId: "cat-001",
        weekStartDate: "2024-01-01",
        createdAt: 1002,
        updatedAt: 1002,
      },
      {
        _id: "r-w2",
        _creationTime: 1003,
        groupId: GROUP_ID,
        date: "2023-12-25",
        shopName: "shop-D",
        amountYen: 3000,
        categoryId: "cat-001",
        weekStartDate: "2023-12-25",
        createdAt: 1003,
        updatedAt: 1003,
      },
      // 4週前はレシートなし（2023-12-18）
    ];

    const ctx = createQueryCtx(createIdentity(), receiptDocs);
    const result = await getFourWeeksSummaryHandler(ctx, { weekStartDate: "2024-01-08" });

    // 4週分返る
    expect(result.weeks).toHaveLength(4);

    // 古い順（昇順）で並んでいること
    expect(result.weeks[0].weekStartDate).toBe("2023-12-18");
    expect(result.weeks[1].weekStartDate).toBe("2023-12-25");
    expect(result.weeks[2].weekStartDate).toBe("2024-01-01");
    expect(result.weeks[3].weekStartDate).toBe("2024-01-08");

    // 各週の合計支出が正しいこと
    expect(result.weeks[0].totalAmountYen).toBe(0);
    expect(result.weeks[1].totalAmountYen).toBe(3000);
    expect(result.weeks[2].totalAmountYen).toBe(500);
    expect(result.weeks[3].totalAmountYen).toBe(3000); // 1000 + 2000

    // weekCount はデータがある週の数
    expect(result.weekCount).toBe(3);
  });

  it("各週のカテゴリ別内訳を返す", async () => {
    const dailyCategory: CategoryDoc = {
      _id: "cat-002",
      _creationTime: 1000,
      groupId: GROUP_ID,
      name: "日用品",
      color: "#A6B28B",
      isActive: true,
      sortOrder: 2,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-w0-food",
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
        _id: "r-w0-daily",
        _creationTime: 1001,
        groupId: GROUP_ID,
        date: "2024-01-09",
        shopName: "shop-B",
        amountYen: 2000,
        categoryId: "cat-002",
        weekStartDate: "2024-01-08",
        createdAt: 1001,
        updatedAt: 1001,
      },
    ];

    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createQueryCtxForSummary(identity, receiptDocs, [sampleCategory, dailyCategory]);
    const result = await getFourWeeksSummaryHandler(ctx, { weekStartDate: "2024-01-08" });

    const currentWeek = result.weeks.find((week) => week.weekStartDate === "2024-01-08");
    expect(currentWeek?.byCategory).toEqual([
      {
        categoryId: "cat-002",
        categoryName: "日用品",
        categoryColor: "#A6B28B",
        totalAmountYen: 2000,
        count: 1,
      },
      {
        categoryId: "cat-001",
        categoryName: "食費",
        categoryColor: "#8B5E3C",
        totalAmountYen: 1000,
        count: 1,
      },
    ]);
  });

  it("全週レシートなしの場合: 4週分の空データを返す", async () => {
    const ctx = createQueryCtx(createIdentity(), []);
    const result = await getFourWeeksSummaryHandler(ctx, { weekStartDate: "2024-01-08" });

    expect(result.weeks).toHaveLength(4);
    result.weeks.forEach((w) => expect(w.totalAmountYen).toBe(0));
    expect(result.weekCount).toBe(0);
  });

  it("1週分のみデータがある場合: weekCount が 1 を返す", async () => {
    const receiptDocs: ReceiptDoc[] = [
      {
        _id: "r-only",
        _creationTime: 1000,
        groupId: GROUP_ID,
        date: "2024-01-08",
        shopName: "shop-only",
        amountYen: 9999,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    const ctx = createQueryCtx(createIdentity(), receiptDocs);
    const result = await getFourWeeksSummaryHandler(ctx, { weekStartDate: "2024-01-08" });

    expect(result.weekCount).toBe(1);
    // 基準週のみデータあり
    const baseWeek = result.weeks.find((w) => w.weekStartDate === "2024-01-08");
    expect(baseWeek?.totalAmountYen).toBe(9999);
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtx(null, []);

    await expect(
      getFourWeeksSummaryHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      getFourWeeksSummaryHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });
});
