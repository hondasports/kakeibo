import { describe, expect, it } from "vitest";
import { mapSpendingEntryToSummaryReceipt } from "./summaryEntries";
import type { SpendingEntry } from "./spendingEntry";

const entry: SpendingEntry = {
  _id: "e1",
  date: "2025-01-10",
  shopName: "店舗A",
  bankName: "銀行B",
  amountYen: 1200,
  categoryId: "cat-1",
  memo: "memo",
  recordType: "expenseEntry",
  type: "expense",
};

describe("mapSpendingEntryToSummaryReceipt", () => {
  it("カテゴリ情報があればその名前・色を使う", () => {
    const map = new Map([["cat-1", { name: "食費", color: "#123456" }]]);
    const result = mapSpendingEntryToSummaryReceipt(entry, map);
    expect(result.categoryName).toBe("食費");
    expect(result.categoryColor).toBe("#123456");
    expect(result.categoryId).toBe("cat-1");
    expect(result._id).toBe("e1");
    expect(result.amountYen).toBe(1200);
  });

  it("カテゴリ情報が無ければフォールバック値を使う", () => {
    const result = mapSpendingEntryToSummaryReceipt(entry, new Map());
    expect(result.categoryName).toBe("不明");
    expect(result.categoryColor).toBe("#AAB7C4");
  });
});
