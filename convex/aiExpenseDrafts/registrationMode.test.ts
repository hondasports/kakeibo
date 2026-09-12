/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const userId = "registration-mode-user";
const identity = {
  tokenIdentifier: userId,
  subject: `clerk-${userId}`,
  issuer: "https://issuer.example",
};

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "家計簿",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId,
      displayName: "テストユーザー",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    const foodId = await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#f97316",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    const dailyId = await ctx.db.insert("categories", {
      groupId,
      name: "日用品",
      color: "#0ea5e9",
      isActive: true,
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const draftId = await ctx.db.insert("aiExpenseDrafts", {
      groupId,
      createdByUserId: userId,
      sourceType: "image_upload",
      status: "registered",
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-08-26",
      amountYen: 1200,
      categoryId: foodId,
      registrationMode: "detailed",
      confidence: { documentType: 1, amountYen: 1, categoryId: 1 },
      reviewReasons: [],
      derivedRegistration: {
        source: "derived",
        destination: "expense_entries",
        registrationMode: "detailed",
        amountYen: 1200,
        date: "2026-08-26",
        categoryIds: [foodId, dailyId],
        registeredAt: 1,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    const foodItemId = await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId,
      itemName: "食品",
      amountYen: 400,
      categoryId: foodId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    });
    const dailyItemId = await ctx.db.insert("aiExpenseDraftItems", {
      groupId,
      draftId,
      itemName: "日用品",
      amountYen: 800,
      categoryId: dailyId,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [amount, categoryId, title] of [
      [400, foodId, "食品"],
      [800, dailyId, "日用品"],
    ] as const) {
      await ctx.db.insert("expenseEntries", {
        groupId,
        createdByUserId: userId,
        aiExpenseDraftId: draftId,
        date: "2026-08-26",
        amount,
        categoryId,
        title,
        entryType: "expense",
        source: "ai_suggested",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    return { groupId, foodId, dailyId, draftId, foodItemId, dailyItemId };
  });
}

describe("registrationMode persistence and aggregation", () => {
  it("切替・再送・集計で同じ支出を一度だけ扱い、OCR明細を保持する", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const authed = t.withIdentity(identity);

    const updateTotalOnly = {
      draftId: ids.draftId,
      date: "2026-08-26",
      amountYen: 1500,
      categoryId: ids.foodId,
      shopName: "スーパー青葉",
      memo: "家計用",
      registrationMode: "totalOnly" as const,
    };
    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, updateTotalOnly);
    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, updateTotalOnly);

    const totalOnlyState = await t.run(async (ctx) => ({
      draft: await ctx.db.get(ids.draftId),
      items: await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("draftId", ids.draftId),
        )
        .collect(),
      entries: await ctx.db
        .query("expenseEntries")
        .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("aiExpenseDraftId", ids.draftId),
        )
        .collect(),
    }));
    expect(totalOnlyState.items).toHaveLength(2);
    expect(totalOnlyState.entries).toHaveLength(1);
    expect(totalOnlyState.entries[0]).toMatchObject({
      amount: 1500,
      categoryId: ids.foodId,
      memo: "家計用",
    });
    expect(totalOnlyState.draft?.derivedRegistration).toMatchObject({
      registrationMode: "totalOnly",
      amountYen: 1500,
      taxRatePercent: null,
      taxableAmountYen: null,
      taxYen: null,
    });

    const { memo: _memo, ...updateWithoutMemo } = updateTotalOnly;
    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, updateWithoutMemo);
    const preservedMemoEntries = await t.run(async (ctx) =>
      ctx.db
        .query("expenseEntries")
        .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("aiExpenseDraftId", ids.draftId),
        )
        .collect(),
    );
    expect(preservedMemoEntries[0]?.memo).toBe("家計用");

    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
      ...updateTotalOnly,
      memo: "",
    });
    const clearedMemoEntries = await t.run(async (ctx) =>
      ctx.db
        .query("expenseEntries")
        .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("aiExpenseDraftId", ids.draftId),
        )
        .collect(),
    );
    expect(clearedMemoEntries).toHaveLength(1);
    expect(clearedMemoEntries[0]).not.toHaveProperty("memo");

    const week = await authed.query(api.receipts.summaries.getWeekSummaryWithCategories, {
      weekStartDate: "2026-08-24",
    });
    const month = await authed.query(api.receipts.summaries.getMonthSummaryWithCategories, {
      month: "2026-08",
    });
    const budget = await authed.query(api.receipts.summaries.getMonthlyExpensesSummary, {
      monthStartDate: "2026-08-01",
    });
    expect(week).toMatchObject({ count: 1, totalAmountYen: 1500 });
    expect(week.byCategory).toEqual([
      expect.objectContaining({ categoryId: ids.foodId, totalAmountYen: 1500, count: 1 }),
    ]);
    expect(week.receipts[0]).toMatchObject({
      registrationMode: "totalOnly",
      aiExpenseDraftId: ids.draftId,
    });
    expect(week.receipts[0]).not.toHaveProperty("itemName");
    expect(month).toMatchObject({ count: 1, totalAmountYen: 1500 });
    expect(budget).toMatchObject({ totalExpensesYen: 1500 });

    await expect(
      authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
        ...updateTotalOnly,
        registrationMode: "detailed",
      }),
    ).rejects.toThrow("Draft item total must match draft amount");
    const afterFailedDetailed = await t.run(async (ctx) => ({
      draft: await ctx.db.get(ids.draftId),
      entries: await ctx.db
        .query("expenseEntries")
        .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("aiExpenseDraftId", ids.draftId),
        )
        .collect(),
    }));
    expect(afterFailedDetailed.draft).toMatchObject({
      amountYen: 1500,
      registrationMode: "totalOnly",
    });
    expect(afterFailedDetailed.entries).toHaveLength(1);
    expect(afterFailedDetailed.entries[0]?.amount).toBe(1500);

    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
      ...updateTotalOnly,
      amountYen: 1200,
      registrationMode: "detailed",
      items: [
        {
          itemId: ids.foodItemId,
          itemName: "食品",
          amountYen: 400,
          categoryId: ids.foodId,
        },
        {
          itemId: ids.dailyItemId,
          itemName: "日用品",
          amountYen: 800,
          categoryId: ids.dailyId,
        },
      ],
    });
    const detailedEntries = await t.run(async (ctx) =>
      ctx.db
        .query("expenseEntries")
        .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("aiExpenseDraftId", ids.draftId),
        )
        .collect(),
    );
    expect(detailedEntries).toHaveLength(2);
    expect(detailedEntries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(1200);
    expect(detailedEntries.every((entry) => entry.memo === "家計用")).toBe(true);
    const detailedDraft = await t.run(async (ctx) => ctx.db.get(ids.draftId));
    expect(detailedDraft?.receiptUserOverride).toMatchObject({
      fields: expect.arrayContaining(["items"]),
      values: { items: expect.arrayContaining([expect.objectContaining({ itemName: "食品" })]) },
    });
  });

  it("他グループの登録済み下書きを更新できない", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    await expect(
      t
        .withIdentity({ ...identity, tokenIdentifier: "other-user" })
        .mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
          draftId: ids.draftId,
          date: "2026-08-26",
          amountYen: 1500,
          categoryId: ids.foodId,
          shopName: "スーパー青葉",
          registrationMode: "totalOnly",
        }),
    ).rejects.toThrow("グループに所属していません");
  });

  it("totalOnly更新でも送信された明細が保存済み明細へ反映される", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const authed = t.withIdentity(identity);

    await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
      draftId: ids.draftId,
      date: "2026-08-26",
      amountYen: 1200,
      categoryId: ids.foodId,
      shopName: "スーパー青葉",
      registrationMode: "totalOnly",
      items: [{ itemName: "牛乳", amountYen: 1200, categoryId: ids.foodId }],
    });

    const state = await t.run(async (ctx) => ({
      draft: await ctx.db.get(ids.draftId),
      items: await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", ids.groupId).eq("draftId", ids.draftId),
        )
        .collect(),
    }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ itemName: "牛乳", amountYen: 1200 });
    expect(state.draft?.receiptUserOverride?.fields).toContain("items");
  });

  it("上限・文字数超過のバリデーションエラーが種別ごとのメッセージになる", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await seed(t);
    const authed = t.withIdentity(identity);
    const base = {
      draftId: ids.draftId,
      date: "2026-08-26",
      amountYen: 1200,
      categoryId: ids.foodId,
      shopName: "スーパー青葉",
      registrationMode: "totalOnly" as const,
    };

    await expect(
      authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
        ...base,
        amountYen: 10_000_000,
      }),
    ).rejects.toThrow("Amount must be 9999999 yen or less");
    await expect(
      authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
        ...base,
        amountYen: -5,
      }),
    ).rejects.toThrow("Amount must be a positive integer");
    await expect(
      authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
        ...base,
        shopName: "あ".repeat(101),
      }),
    ).rejects.toThrow("Shop name must be 100 characters or less");
    await expect(
      authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
        ...base,
        shopName: "   ",
      }),
    ).rejects.toThrow("Shop name is required");
  });
});
