import { getReceiptsByDateHandler, getReceiptsByWeekHandler } from "./crud";
import { getWeekSummaryHandler } from "./summaries";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { ExpenseEntryDoc, ReceiptDoc } from "./testHelpers";
import { GROUP_ID, OTHER_GROUP_ID, OTHER_USER_ID, USER_ID, createIdentity, createQueryCtx, sampleReceipt } from "./testHelpers";

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

describe("getReceiptsByDate", () => {
  it("正常系: 指定日のレシートが返される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const docs = [sampleReceipt];
    const ctx = createQueryCtx(identity, docs);

    const result = await getReceiptsByDateHandler(ctx, { date: "2024-01-10" });

    expect(result).toEqual(docs);
  });
});

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
