import { insertReceiptForGroup } from "../../lib/convex/receipts/insert";
import { calculateWeekStartDate } from "../lib/weekDates";
import { createReceiptHandler, deleteReceiptHandler, updateReceiptHandler } from "./crud";
import { createReceipt, deleteReceipt, deleteReceiptsByUser, updateReceipt } from "./mutations";
import {
  CategoryDoc,
  GROUP_ID,
  ReceiptDoc,
  USER_ID,
  createIdentity,
  createMutationCtx,
  invokeRegisteredMutation,
  otherGroupCategory,
  otherGroupReceipt,
  sampleCategory,
  sampleReceipt,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("calculateWeekStartDate", () => {
  it("月曜日の場合: その日が返される", () => {
    expect(calculateWeekStartDate("2024-01-08")).toBe("2024-01-08");
  });

  it("日曜日の場合: 前の月曜日が返される", () => {
    expect(calculateWeekStartDate("2024-01-14")).toBe("2024-01-08");
  });

  it("水曜日の場合: 当週月曜日が返される", () => {
    expect(calculateWeekStartDate("2024-01-10")).toBe("2024-01-08");
  });

  it("火曜日の場合: 当週月曜日が返される", () => {
    expect(calculateWeekStartDate("2024-01-09")).toBe("2024-01-08");
  });

  it("土曜日の場合: 当週月曜日が返される", () => {
    expect(calculateWeekStartDate("2024-01-13")).toBe("2024-01-08");
  });
});

// ---------------------------------------------------------------------------
// createReceipt テスト
// ---------------------------------------------------------------------------

describe("createReceipt", () => {
  it("正常系: receipt が作成されて返される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const createdReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "new-receipt-id",
    };

    const ctx = createMutationCtx(identity, {
      getDocById: {
        "cat-001": sampleCategory,
      },
      insertedDoc: createdReceipt,
    });

    const result = await createReceiptHandler(ctx, {
      date: "2024-01-10",
      shopName: "スーパー",
      amountYen: 1500,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-001" as any,
    });

    expect(result).toEqual(createdReceipt);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbInsert).toHaveBeenCalledWith(
      "receipts",
      expect.objectContaining({
        groupId: GROUP_ID,
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("水曜日始まりの設定で作成時の週開始日を計算する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const createdReceipt: ReceiptDoc = {
      ...sampleReceipt,
      _id: "new-receipt-id",
      date: "2024-01-14",
      weekStartDate: "2024-01-10",
    };
    const ctx = createMutationCtx(identity, {
      getDocById: { "cat-001": sampleCategory },
      insertedDoc: createdReceipt,
      weeklyStartDay: 3,
    });

    await createReceiptHandler(ctx, {
      date: "2024-01-14",
      shopName: "スーパー",
      amountYen: 1500,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-001" as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "receipts",
      expect.objectContaining({ date: "2024-01-14", weekStartDate: "2024-01-10" }),
    );
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-001" as any,
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-001" as any,
      }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });

  it("別グループのカテゴリを使用時: ConvexError が throw される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "cat-other": otherGroupCategory,
      },
    });

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-other" as any,
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-other" as any,
      }),
    ).rejects.toMatchObject({
      data: "Category does not belong to the current group",
    });
  });

  it("無効化済みカテゴリを使用時: ConvexError が throw される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "cat-001": { ...sampleCategory, isActive: false },
      },
    });

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-001" as any,
      }),
    ).rejects.toMatchObject({
      data: "Inactive category cannot be used for new receipts",
    });
  });

  it("カテゴリが存在しない場合は作成を拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity);

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        categoryId: "cat-missing" as any,
      }),
    ).rejects.toMatchObject({ data: "Category not found" });
  });

  it("作成直後に receipt を取得できない場合は失敗として扱う", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: { "cat-001": sampleCategory },
    });

    await expect(
      createReceiptHandler(ctx, {
        date: "2024-01-10",
        shopName: "スーパー",
        amountYen: 1500,
        categoryId: "cat-001" as any,
      }),
    ).rejects.toMatchObject({ data: "Failed to retrieve created receipt" });
  });

  it("グループに属さないカテゴリを低レベル挿入でも拒否する", async () => {
    const ctx = createMutationCtx(createIdentity({ tokenIdentifier: USER_ID }), {
      getDocById: { "cat-other": otherGroupCategory },
    });

    await expect(
      insertReceiptForGroup(
        ctx,
        GROUP_ID as any,
        {
          date: "2024-01-10",
          shopName: "スーパー",
          amountYen: 1500,
          categoryId: "cat-other" as any,
        },
        1,
        USER_ID,
      ),
    ).rejects.toMatchObject({ data: "Category does not belong to the current group" });
  });

  it("カテゴリが存在しない場合は更新を拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: { "receipt-001": sampleReceipt },
    });

    await expect(
      updateReceiptHandler(ctx, {
        receiptId: "receipt-001" as any,
        categoryId: "cat-missing" as any,
      }),
    ).rejects.toMatchObject({ data: "Category not found" });
  });

  it("別グループのカテゴリへの更新を拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-001": sampleReceipt,
        "cat-other": otherGroupCategory,
      },
    });

    await expect(
      updateReceiptHandler(ctx, {
        receiptId: "receipt-001" as any,
        categoryId: "cat-other" as any,
      }),
    ).rejects.toMatchObject({ data: "Category does not belong to the current group" });
  });

  it("存在しない receipt の更新を拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity);

    await expect(
      updateReceiptHandler(ctx, {
        receiptId: "receipt-missing" as any,
        shopName: "更新後店舗",
      }),
    ).rejects.toMatchObject({ data: "Receipt not found" });
  });

  it("不正な更新値を拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: { "receipt-001": sampleReceipt },
    });

    await expect(
      updateReceiptHandler(ctx, {
        receiptId: "receipt-001" as any,
        date: "2024-99-99",
      }),
    ).rejects.toMatchObject({ data: "Date must be a valid YYYY-MM-DD value" });
  });

  it("更新後の receipt を取得できない場合は失敗として扱う", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: { "receipt-001": sampleReceipt },
      returnNullAfterPatch: true,
    });

    await expect(
      updateReceiptHandler(ctx, {
        receiptId: "receipt-001" as any,
        shopName: "更新後店舗",
      }),
    ).rejects.toMatchObject({ data: "Failed to retrieve updated receipt" });
  });

  it("収入: bankName で receipt が作成されて返される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const createdReceipt: ReceiptDoc = {
      _id: "new-receipt-id",
      _creationTime: 1000,
      groupId: GROUP_ID,
      date: "2024-01-10",
      type: "income",
      bankName: "三菱UFJ銀行",
      amountYen: 200000,
      categoryId: "cat-001",
      weekStartDate: "2024-01-08",
      createdAt: 1000,
      updatedAt: 1000,
    };

    const ctx = createMutationCtx(identity, {
      getDocById: { "cat-001": sampleCategory },
      insertedDoc: createdReceipt,
    });

    const result = await createReceiptHandler(ctx, {
      type: "income",
      date: "2024-01-10",
      bankName: "三菱UFJ銀行",
      amountYen: 200000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-001" as any,
    });

    expect(result).toEqual(createdReceipt);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "receipts",
      expect.objectContaining({
        groupId: GROUP_ID,
        date: "2024-01-10",
        type: "income",
        bankName: "三菱UFJ銀行",
        amountYen: 200000,
        categoryId: "cat-001",
        weekStartDate: "2024-01-08",
      }),
    );
  });

  it("支出: shopName が空の場合 ConvexError が throw される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: { "cat-001": sampleCategory },
    });

    await expect(
      createReceiptHandler(ctx, {
        type: "expense",
        date: "2024-01-10",
        shopName: "",
        amountYen: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-001" as any,
      } as Parameters<typeof createReceiptHandler>[1]),
    ).rejects.toMatchObject({ data: "shopName is required for expense receipts" });
  });

  it("収入: bankName が空の場合 ConvexError が throw される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: { "cat-001": sampleCategory },
    });

    await expect(
      createReceiptHandler(ctx, {
        type: "income",
        date: "2024-01-10",
        bankName: "",
        amountYen: 200000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-001" as any,
      }),
    ).rejects.toMatchObject({ data: "bankName is required for income receipts" });
  });
});

// ---------------------------------------------------------------------------
// getReceiptsByWeek テスト
// ---------------------------------------------------------------------------

describe("updateReceipt", () => {
  it("正常系: receipt が更新される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const updatedReceipt: ReceiptDoc = {
      ...sampleReceipt,
      shopName: "イオン",
      amountYen: 2000,
      updatedAt: 9999,
    };

    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-001": sampleReceipt,
      },
      updatedDoc: updatedReceipt,
    });

    const result = await updateReceiptHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receiptId: "receipt-001" as any,
      shopName: "イオン",
      amountYen: 2000,
    });

    expect(result).toEqual(updatedReceipt);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledOnce();
    expect(dbPatch).toHaveBeenCalledWith(
      "receipt-001",
      expect.objectContaining({
        shopName: "イオン",
        amountYen: 2000,
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("水曜日始まりの設定で日付更新時の週開始日を再計算する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const existingReceipt: ReceiptDoc = {
      ...sampleReceipt,
      date: "2024-01-10",
      weekStartDate: "2024-01-10",
    };
    const updatedReceipt: ReceiptDoc = {
      ...existingReceipt,
      date: "2024-01-14",
      weekStartDate: "2024-01-10",
      updatedAt: 9999,
    };
    const ctx = createMutationCtx(identity, {
      getDocById: { "receipt-001": existingReceipt },
      updatedDoc: updatedReceipt,
      weeklyStartDay: 3,
    });

    await updateReceiptHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receiptId: "receipt-001" as any,
      date: "2024-01-14",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "receipt-001",
      expect.objectContaining({ date: "2024-01-14", weekStartDate: "2024-01-10" }),
    );
  });

  it("別グループの receipt 更新試みる: ConvexError が throw される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-other": otherGroupReceipt,
      },
    });

    await expect(
      updateReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-other" as any,
        shopName: "新しい店",
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      updateReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-other" as any,
        shopName: "新しい店",
      }),
    ).rejects.toMatchObject({
      data: "Receipt does not belong to the current group",
    });
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      updateReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-001" as any,
        shopName: "新しい店",
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      updateReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-001" as any,
        shopName: "新しい店",
      }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });

  it("無効化済みカテゴリへの変更は拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-001": sampleReceipt,
        "cat-inactive": {
          ...sampleCategory,
          _id: "cat-inactive",
          isActive: false,
        },
      },
    });

    await expect(
      updateReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-001" as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "cat-inactive" as any,
      }),
    ).rejects.toMatchObject({
      data: "Inactive category cannot be used for new receipts",
    });
  });

  it("既存 receipt と同じ無効化済みカテゴリは保持したまま更新できる", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const inactiveCategory: CategoryDoc = {
      ...sampleCategory,
      isActive: false,
    };
    const receiptWithInactiveCategory: ReceiptDoc = {
      ...sampleReceipt,
      categoryId: "cat-001",
    };
    const updatedReceipt: ReceiptDoc = {
      ...receiptWithInactiveCategory,
      shopName: "更新後店舗",
      updatedAt: 9999,
    };
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-001": receiptWithInactiveCategory,
        "cat-001": inactiveCategory,
      },
      updatedDoc: updatedReceipt,
    });

    const result = await updateReceiptHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receiptId: "receipt-001" as any,
      shopName: "更新後店舗",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "cat-001" as any,
    });

    expect(result).toEqual(updatedReceipt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "receipt-001",
      expect.objectContaining({
        shopName: "更新後店舗",
        categoryId: "cat-001",
      }),
    );
  });

  it("収入 receipt は categoryId なしで bankName を更新できる", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const incomeReceipt: ReceiptDoc = {
      ...sampleReceipt,
      type: "income",
      bankName: "給与",
      shopName: undefined,
    };
    const updatedReceipt: ReceiptDoc = {
      ...incomeReceipt,
      bankName: "賞与",
      amountYen: 200_000,
      updatedAt: 9999,
    };
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-001": incomeReceipt,
      },
      updatedDoc: updatedReceipt,
    });

    const result = await updateReceiptHandler(ctx, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      receiptId: "receipt-001" as any,
      bankName: "賞与",
      amountYen: 200_000,
    });

    expect(result).toEqual(updatedReceipt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "receipt-001",
      expect.objectContaining({
        bankName: "賞与",
        amountYen: 200_000,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteReceipt テスト
// ---------------------------------------------------------------------------

describe("deleteReceipt", () => {
  it("正常系: receipt が削除される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-001": sampleReceipt,
      },
    });

    await expect(
      deleteReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-001" as any,
      }),
    ).resolves.toBeUndefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbDelete = (ctx.db as any).delete as ReturnType<typeof vi.fn>;
    expect(dbDelete).toHaveBeenCalledOnce();
    expect(dbDelete).toHaveBeenCalledWith("receipt-001");
  });

  it("別グループの receipt 削除試みる: ConvexError が throw される", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity, {
      getDocById: {
        "receipt-other": otherGroupReceipt,
      },
    });

    await expect(
      deleteReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-other" as any,
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      deleteReceiptHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receiptId: "receipt-other" as any,
      }),
    ).rejects.toMatchObject({
      data: "Receipt does not belong to the current group",
    });
  });

  it("存在しない receipt の削除を拒否する", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const ctx = createMutationCtx(identity);

    await expect(
      deleteReceiptHandler(ctx, { receiptId: "receipt-missing" as any }),
    ).rejects.toMatchObject({ data: "Receipt not found" });
  });
});

describe("registered receipt mutations", () => {
  it("登録済みmutationのhandlerを通して通常処理を呼び出す", async () => {
    const identity = createIdentity({ tokenIdentifier: USER_ID });
    const createCtx = createMutationCtx(identity, {
      getDocById: { "cat-001": sampleCategory },
      insertedDoc: sampleReceipt,
    });
    await invokeRegisteredMutation(createReceipt, createCtx, {
      date: "2024-01-10",
      amountYen: 1000,
      categoryId: "cat-001",
      type: "expense",
      shopName: "店",
    });

    const updateCtx = createMutationCtx(identity, {
      getDocById: { "receipt-001": sampleReceipt },
      updatedDoc: sampleReceipt,
    });
    await invokeRegisteredMutation(updateReceipt, updateCtx, {
      receiptId: "receipt-001",
      shopName: "更新店",
    });

    const deleteCtx = createMutationCtx(identity, {
      getDocById: { "receipt-001": sampleReceipt },
    });
    await invokeRegisteredMutation(deleteReceipt, deleteCtx, { receiptId: "receipt-001" });

    const cleanupCtx = createMutationCtx(identity, { queryDocs: [] });
    await invokeRegisteredMutation(deleteReceiptsByUser, cleanupCtx, {
      groupId: GROUP_ID,
      userId: USER_ID,
    });

    expect(createCtx.db.insert).toHaveBeenCalled();
    expect(updateCtx.db.patch).toHaveBeenCalled();
    expect(deleteCtx.db.delete).toHaveBeenCalledWith("receipt-001");
  });
});

// ---------------------------------------------------------------------------
// getWeekSummary テスト
// ---------------------------------------------------------------------------
