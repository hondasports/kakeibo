import { insertReceiptForGroup } from "../../lib/convex/receipts/insert";
import { calculateWeekStartDate } from "../lib/weekDates";
import { createReceiptHandler, updateReceiptHandler } from "./crud";
import { createReceipt } from "./mutations";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptDoc } from "./testHelpers";
import {
  GROUP_ID,
  USER_ID,
  createIdentity,
  createMutationCtx,
  otherGroupCategory,
  sampleCategory,
  sampleReceipt,
} from "./testHelpers";

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
