import { describe, expect, it } from "vitest";
import { calculateWeekStartDate } from "../../lib/domain/week/weekDates";
import { updateReceiptHandler } from "./crud";
import {
  USER_ID,
  createIdentity,
  createMutationCtx,
  otherGroupCategory,
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

describe("updateReceipt validation", () => {
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
});
