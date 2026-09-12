import { describe, expect, it } from "vitest";
import { Receipt } from "./receipt";

const GROUP_ID = "group-001";

describe("Receipt.create", () => {
  it("支出レシートを構築し weekStartDate を計算する", () => {
    // 2025-01-10 は金曜日。週開始=月曜(1)なら weekStartDate は 2025-01-06
    const receipt = Receipt.create(
      {
        date: "2025-01-10",
        shopName: "  スーパー  ",
        amountYen: 1500,
        categoryId: "cat-1",
      },
      { groupId: GROUP_ID, createdByUserId: "user-1", weeklyStartDay: 1 },
      1000,
    );
    const fields = receipt.toInsertFields();
    expect(fields.shopName).toBe("スーパー");
    expect(fields.weekStartDate).toBe("2025-01-06");
    expect(fields.createdAt).toBe(1000);
  });

  it("収入レシートは bankName が必須", () => {
    expect(() =>
      Receipt.create(
        {
          type: "income",
          date: "2025-01-10",
          amountYen: 1000,
          categoryId: "cat-1",
        },
        { groupId: GROUP_ID, createdByUserId: "user-1", weeklyStartDay: 1 },
        1000,
      ),
    ).toThrow("bankName is required for income receipts");
  });
});

describe("Receipt.buildUpdatePatch", () => {
  const receipt = Receipt.fromPersisted({
    id: "receipt-1",
    groupId: GROUP_ID,
    date: "2025-01-10",
    shopName: "スーパー",
    amountYen: 1500,
    categoryId: "cat-1",
    weekStartDate: "2025-01-06",
    createdAt: 1000,
    updatedAt: 1000,
  });

  it("date 変更時は weekStartDate を再計算する", () => {
    // 2025-01-17(金) 週開始=月曜 → 2025-01-13
    const patch = receipt.buildUpdatePatch({ date: "2025-01-17" }, 1);
    expect(patch.date).toBe("2025-01-17");
    expect(patch.weekStartDate).toBe("2025-01-13");
  });

  it("date 未指定なら weekStartDate を含めない", () => {
    const patch = receipt.buildUpdatePatch({ amountYen: 2000 }, 1);
    expect(patch.weekStartDate).toBeUndefined();
    expect(patch.amountYen).toBe(2000);
  });
});

describe("Receipt 所有権・種別の知識", () => {
  it("所有権と支出判定", () => {
    const receipt = Receipt.fromPersisted({
      id: "r-1",
      groupId: GROUP_ID,
      date: "2025-01-10",
      amountYen: 100,
      categoryId: "cat-1",
      weekStartDate: "2025-01-06",
      createdAt: 1,
      updatedAt: 1,
    });
    expect(receipt.belongsToGroup(GROUP_ID)).toBe(true);
    expect(receipt.belongsToGroup("other")).toBe(false);
    expect(receipt.isExpenseRecord()).toBe(true);
  });
});
