import { deleteReceiptHandler, updateReceiptHandler } from "./crud";
import { createReceipt, deleteReceipt, deleteReceiptsByUser, updateReceipt } from "./mutations";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { CategoryDoc, ReceiptDoc } from "./testHelpers";
import {
  GROUP_ID,
  USER_ID,
  createIdentity,
  createMutationCtx,
  invokeRegisteredMutation,
  otherGroupReceipt,
  sampleCategory,
  sampleReceipt,
} from "./testHelpers";

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
