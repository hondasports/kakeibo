import { describe, expect, it } from "vitest";
import {
  MAX_BULK_SPENDING_SELECTION,
  canSelectAnotherSpendingRecord,
  countBulkSpendingIds,
  dedupeIds,
  getBulkSpendingLimitErrorMessage,
  isExpenseReceiptType,
} from "../../domain/spending/bulkSpending";

describe("bulk spending id helpers", () => {
  it("重複IDを除いて件数を数える", () => {
    expect(
      countBulkSpendingIds({
        expenseEntryIds: ["entry-1", "entry-1", "entry-2"],
        receiptIds: ["receipt-1", "receipt-1"],
      }),
    ).toBe(3);
    expect(dedupeIds(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("100件まで選択でき、101件目は拒否する", () => {
    expect(canSelectAnotherSpendingRecord(99)).toBe(true);
    expect(canSelectAnotherSpendingRecord(MAX_BULK_SPENDING_SELECTION)).toBe(false);
    expect(getBulkSpendingLimitErrorMessage()).toBe("一度に選べる明細は100件までです");
  });

  it("legacy receipt の type 未設定は支出として扱う", () => {
    expect(isExpenseReceiptType(undefined)).toBe(true);
    expect(isExpenseReceiptType("expense")).toBe(true);
    expect(isExpenseReceiptType("income")).toBe(false);
  });
});
