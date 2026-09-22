import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { createExpenseEntriesFromDraftHandler } from "./mutations";
import type { AiExpenseDraftDoc } from "./testHelpers";
import { catFoodId, catDailyId, draftReadyId, OTHER_GROUP_ID, createIdentity, createMutationCtx, activeFoodCategory, activeDailyCategory, readyDraft } from "./testHelpers";

describe("createExpenseEntriesFromDraftHandler", () => {
  it("AI下書きのitemsから複数のexpenseEntriesを作成できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "cat-food": activeFoodCategory,
        "cat-daily": activeDailyCategory,
      },
    });

    const result = await createExpenseEntriesFromDraftHandler(ctx, {
      draftId: draftReadyId,
      items: [
        { itemName: "食料品", amountYen: 1000, categoryId: catFoodId },
        { itemName: "日用品", amountYen: 500, categoryId: catDailyId },
      ],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      1,
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-01",
        amount: 1000,
        categoryId: "cat-food",
        title: "食料品",
        entryType: "expense",
        source: "ai_suggested",
      }),
    );
    expect(ctx.db.insert).toHaveBeenNthCalledWith(
      2,
      "expenseEntries",
      expect.objectContaining({
        date: "2026-06-01",
        amount: 500,
        categoryId: "cat-daily",
        title: "日用品",
        entryType: "expense",
        source: "ai_suggested",
      }),
    );
  });

  it("itemのcategoryIdがnullの場合、draftのcategoryIdをフォールバックする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": readyDraft,
        "cat-food": activeFoodCategory,
      },
    });

    await createExpenseEntriesFromDraftHandler(ctx, {
      draftId: draftReadyId,
      items: [{ itemName: "不明な品目", amountYen: 1000, categoryId: undefined }],
    });

    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "expenseEntries",
      expect.objectContaining({
        categoryId: "cat-food", // draftのcategoryIdが使用される
        title: "不明な品目",
      }),
    );
  });

  it("未認証の場合、ConvexErrorを投げる", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("他のグループの下書きの場合、ConvexErrorを投げる", async () => {
    const otherGroupDraft: AiExpenseDraftDoc = {
      ...readyDraft,
      groupId: OTHER_GROUP_ID,
    };
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": otherGroupDraft },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("存在しない下書きIDの場合、ConvexErrorを投げる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "draft-ready": null },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("ready 以外の下書きからは expenseEntries を作成できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": {
          ...readyDraft,
          status: "needs_review",
        },
      },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow("Only ready drafts can create expense entries");
  });

  it("日付が未確定の下書きからは expenseEntries を作成できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-ready": {
          ...readyDraft,
          date: undefined,
        },
      },
    });

    await expect(
      createExpenseEntriesFromDraftHandler(ctx, {
        draftId: draftReadyId,
        items: [{ itemName: "テスト", amountYen: 1000, categoryId: catFoodId }],
      }),
    ).rejects.toThrow("Draft date is required");
  });
});
