import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { deleteExpenseEntryHandler, updateExpenseEntryHandler } from "./mutations";
import { catDailyId, entryId, OTHER_GROUP_ID, createIdentity, createMutationCtx, activeDailyCategory, baseExpenseEntry } from "./testHelpers";

describe("updateExpenseEntryHandler", () => {
  it("金額・カテゴリ・日付・タイトル・メモを更新できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "entry-001": baseExpenseEntry,
        "cat-daily": activeDailyCategory,
      },
    });

    await updateExpenseEntryHandler(ctx, {
      expenseEntryId: entryId,
      date: "2026-06-08",
      amountYen: 1500,
      categoryId: catDailyId,
      title: "スーパーB",
      memo: "朝食",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "entry-001",
      expect.objectContaining({
        date: "2026-06-08",
        amount: 1500,
        categoryId: "cat-daily",
        title: "スーパーB",
        memo: "朝食",
      }),
    );
  });

  it("0以下の金額は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });

    await expect(
      updateExpenseEntryHandler(ctx, {
        expenseEntryId: entryId,
        amountYen: 0,
      }),
    ).rejects.toThrow("Amount must be a positive integer");
  });

  it("不正な日付は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });

    await expect(
      updateExpenseEntryHandler(ctx, {
        expenseEntryId: entryId,
        date: "",
      }),
    ).rejects.toThrow("Date must be a valid YYYY-MM-DD value");
  });

  it("他グループの記録は更新できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "entry-001": { ...baseExpenseEntry, groupId: OTHER_GROUP_ID },
      },
    });

    await expect(
      updateExpenseEntryHandler(ctx, {
        expenseEntryId: entryId,
        title: "変更",
      }),
    ).rejects.toThrow(ConvexError);
  });
});

describe("deleteExpenseEntryHandler", () => {
  it("自分のグループの記録を削除できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: { "entry-001": baseExpenseEntry },
    });

    await deleteExpenseEntryHandler(ctx, { expenseEntryId: entryId });

    expect(ctx.db.delete).toHaveBeenCalledWith("entry-001");
  });

  it("他グループの記録は削除できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "entry-001": { ...baseExpenseEntry, groupId: OTHER_GROUP_ID },
      },
    });

    await expect(deleteExpenseEntryHandler(ctx, { expenseEntryId: entryId })).rejects.toThrow(
      ConvexError,
    );
  });
});
