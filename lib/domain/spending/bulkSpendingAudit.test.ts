import { describe, expect, it } from "vitest";
import {
  BULK_SPENDING_CATEGORY_CHANGED_ACTION,
  BULK_SPENDING_DELETED_ACTION,
  buildBulkSpendingAuditSnapshot,
  formatBulkSpendingAuditTargetLabel,
} from "./bulkSpendingAudit";

describe("buildBulkSpendingAuditSnapshot", () => {
  it("件数・ID・日付・カテゴリだけを残し、金額や店名は持たない", () => {
    const snapshot = buildBulkSpendingAuditSnapshot(
      [
        { id: "entry-001", kind: "expenseEntry", date: "2026-08-10", categoryId: "cat-daily" },
        { id: "receipt-001", kind: "receipt", date: "2026-08-10", categoryId: "cat-food" },
      ],
      new Map([
        ["cat-daily", "日用品"],
        ["cat-food", "食費"],
      ]),
      { categoryId: "cat-food", categoryName: "食費" },
    );

    expect(snapshot).toEqual({
      recordCount: 2,
      expenseEntryIds: ["entry-001"],
      receiptIds: ["receipt-001"],
      dates: ["2026-08-10"],
      previousCategoryIds: ["cat-daily", "cat-food"],
      previousCategoryNames: ["日用品", "食費"],
      categoryId: "cat-food",
      categoryName: "食費",
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/amount|shopName|title|memo/i);
  });
});

describe("formatBulkSpendingAuditTargetLabel", () => {
  it("カテゴリ変更は件数と前後カテゴリを表示する", () => {
    expect(
      formatBulkSpendingAuditTargetLabel(
        {
          recordCount: 2,
          expenseEntryIds: ["entry-001"],
          receiptIds: ["receipt-001"],
          dates: ["2026-08-10"],
          previousCategoryIds: ["cat-daily"],
          previousCategoryNames: ["日用品"],
          categoryId: "cat-food",
          categoryName: "食費",
        },
        BULK_SPENDING_CATEGORY_CHANGED_ACTION,
      ),
    ).toBe("支出明細2件: 日用品 → 食費");
  });

  it("削除は件数だけを表示する", () => {
    expect(
      formatBulkSpendingAuditTargetLabel(
        {
          recordCount: 2,
          expenseEntryIds: ["entry-001"],
          receiptIds: ["receipt-001"],
          dates: ["2026-08-10"],
          previousCategoryIds: ["cat-daily"],
          previousCategoryNames: ["日用品"],
        },
        BULK_SPENDING_DELETED_ACTION,
      ),
    ).toBe("支出明細2件");
  });
});
