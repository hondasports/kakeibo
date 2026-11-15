import { describe, expect, it } from "vitest";
import { Receipt } from "./receipt";

const GROUP_ID = "group-001";

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
