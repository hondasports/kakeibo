import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { createExpenseEntries, createExpenseEntriesFromDraft, createIncomeEntry, createIncomeEntryHandler, createExpenseEntriesHandler, deleteExpenseEntry, updateExpenseEntry } from "./mutations";
import type { CategoryDoc } from "./testHelpers";
import { catFoodId, catDailyId, draftReadyId, sourceDocumentId, entryId, GROUP_ID, OTHER_GROUP_ID, invokeRegisteredMutation, createIdentity, createMutationCtx, activeFoodCategory, activeDailyCategory, readyDraft, baseExpenseEntry } from "./testHelpers";

describe("createExpenseEntriesHandler", () => {
  it("単一支出項目を expenseEntries に保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      items: [{ categoryId: catFoodId, amountYen: 2000, title: "スーパー北浜", memo: undefined }],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-07",
        amount: 2000,
        categoryId: "cat-food",
        title: "スーパー北浜",
        entryType: "expense",
        source: "manual",
      }),
    );
  });

  it("複数支出項目をそれぞれ expenseEntries に保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      items: [
        { categoryId: catFoodId, amountYen: 3000, title: "食料品" },
        { categoryId: catDailyId, amountYen: 2000, title: "日用品" },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      1,
      "expenseEntries",
      expect.objectContaining({ amount: 3000, categoryId: "cat-food", title: "食料品" }),
    );
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      2,
      "expenseEntries",
      expect.objectContaining({ amount: 2000, categoryId: "cat-daily", title: "日用品" }),
    );
  });

  it("手入力でも0円以下の支出項目は保存しない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": activeFoodCategory },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 0, title: "不正な支出" }],
      }),
    ).rejects.toThrow("Amount must be a positive integer");
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("未認証の場合、ConvexError を投げる", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("存在しないカテゴリIDの場合、ConvexError を投げる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": null },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("他のグループのカテゴリIDの場合、ConvexError を投げる", async () => {
    const otherGroupCategory: CategoryDoc = {
      ...activeFoodCategory,
      groupId: OTHER_GROUP_ID,
    };
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": otherGroupCategory },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("無効化されたカテゴリIDの場合、ConvexError を投げる", async () => {
    const inactiveCategory: CategoryDoc = { ...activeFoodCategory, isActive: false };
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": inactiveCategory },
    });

    await expect(
      createExpenseEntriesHandler(ctx, {
        date: "2026-06-07",
        items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("メモが指定された場合、memo フィールドに保存される", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": activeFoodCategory },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品", memo: "特売日" }],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({ memo: "特売日" }),
    );
  });

  it("sourceDocumentId が指定された場合、expenseEntries に紐付けて保存できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "source-doc-1": {
          _id: "source-doc-1",
          _creationTime: 1000,
          groupId: GROUP_ID,
          sourceType: "manual",
          status: "finalized",
          createdAt: 1000,
          updatedAt: 1000,
        },
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      sourceDocumentId,
      items: [{ categoryId: catFoodId, amountYen: 2000, title: "食料品" }],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({ sourceDocumentId: "source-doc-1" }),
    );
  });

  it("店舗名が指定された場合、手入力をsourceDocumentにまとめて保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    await createExpenseEntriesHandler(ctx, {
      date: "2026-06-07",
      shopName: "スーパー北浜",
      sourceAmountYen: 5000,
      items: [
        { categoryId: catFoodId, amountYen: 3000, title: "食料品" },
        { categoryId: catDailyId, amountYen: 2000, title: "洗剤" },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "sourceDocuments",
      expect.objectContaining({
        sourceType: "manual",
        status: "finalized",
        shopName: "スーパー北浜",
        totalAmount: 5000,
      }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({ sourceDocumentId: "new-entry-id" }),
    );
  });

  it.each([-1, 1.5, Number.NaN])(
    "sourceAmountYen が正の整数でない場合は保存しない（%s）",
    async (sourceAmountYen) => {
      const ctx = createMutationCtx(createIdentity(), {
        getDocById: { "cat-food": activeFoodCategory },
      });

      await expect(
        createExpenseEntriesHandler(ctx, {
          date: "2026-06-07",
          shopName: "スーパー北浜",
          sourceAmountYen,
          items: [{ categoryId: catFoodId, amountYen: 1000, title: "食料品" }],
        }),
      ).rejects.toThrow("Source amount must be a positive integer");
      expect(ctx.db.insert).not.toHaveBeenCalled();
    },
  );
});

describe("createIncomeEntryHandler", () => {
  it("カテゴリなしの収入を income として保存できる", async () => {
    const ctx = createMutationCtx(createIdentity());

    await createIncomeEntryHandler(ctx, {
      date: "2026-06-07",
      amountYen: 320000,
      title: "給与",
    });

    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-07",
        amount: 320000,
        title: "給与",
        entryType: "income",
        source: "manual",
      }),
    );
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.not.objectContaining({ categoryId: expect.anything() }),
    );
  });

  it("未認証の場合は保存しない", async () => {
    const ctx = createMutationCtx(null);
    await expect(
      createIncomeEntryHandler(ctx, {
        date: "2026-06-07",
        amountYen: 320000,
        title: "給与",
      }),
    ).rejects.toThrow(ConvexError);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it.each([
    [{ date: "", amountYen: 1000, title: "給与" }, "Date must be a valid YYYY-MM-DD value"],
    [{ date: "2026-06-07", amountYen: 0, title: "給与" }, "Amount must be a positive integer"],
    [{ date: "2026-06-07", amountYen: 1000, title: "   " }, "Income description is required"],
  ])("不正な収入は保存しない", async (args, message) => {
    const ctx = createMutationCtx(createIdentity());
    await expect(createIncomeEntryHandler(ctx, args)).rejects.toThrow(message);
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});

describe("registered expense entry mutations", () => {
  it("登録済みmutationの薄いhandlerを通して各業務handlerを呼び出す", async () => {
    const incomeCtx = createMutationCtx(createIdentity());
    await invokeRegisteredMutation(createIncomeEntry, incomeCtx, {
      date: "2026-06-07",
      amountYen: 320000,
      title: "給与",
    });

    const expenseCtx = createMutationCtx(createIdentity(), {
      getDocById: { "cat-food": activeFoodCategory },
    });
    await invokeRegisteredMutation(createExpenseEntries, expenseCtx, {
      date: "2026-06-07",
      items: [{ categoryId: catFoodId, amountYen: 1000, title: "食料品" }],
    });

    const draftCtx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": readyDraft, "cat-food": activeFoodCategory },
    });
    await invokeRegisteredMutation(createExpenseEntriesFromDraft, draftCtx, {
      draftId: draftReadyId,
      items: [{ itemName: "食料品", amountYen: 1000, categoryId: catFoodId }],
    });

    const updateCtx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });
    await invokeRegisteredMutation(updateExpenseEntry, updateCtx, {
      expenseEntryId: entryId,
      title: "更新後",
    });

    const deleteCtx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });
    await invokeRegisteredMutation(deleteExpenseEntry, deleteCtx, { expenseEntryId: entryId });

    expect(incomeCtx.db.insert).toHaveBeenCalled();
    expect(expenseCtx.db.insert).toHaveBeenCalled();
    expect(draftCtx.db.insert).toHaveBeenCalled();
    expect(updateCtx.db.patch).toHaveBeenCalled();
    expect(deleteCtx.db.delete).toHaveBeenCalledWith("entry-001");
  });
});
