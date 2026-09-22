import { getFourWeeksSummaryHandler } from "./summaries";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { CategoryDoc, ReceiptDoc } from "./testHelpers";
import { GROUP_ID, USER_ID, createIdentity, createQueryCtx, createQueryCtxForSummary, sampleCategory } from "./testHelpers";

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
