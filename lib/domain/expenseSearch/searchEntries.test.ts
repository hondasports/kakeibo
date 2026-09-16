import { describe, expect, it } from "vitest";
import {
  dedupeSearchEntries,
  mergeSearchEntrySources,
  partitionExpenseEntriesByKind,
  partitionReceiptsByKind,
} from "./searchEntries";

describe("dedupeSearchEntries", () => {
  it("recordType:_id が同じものだけを重複排除する", () => {
    const entries = [
      { _id: "a", recordType: "expenseEntry" },
      { _id: "a", recordType: "expenseEntry" },
      { _id: "a", recordType: "receipt" },
      { _id: "b", recordType: "receipt" },
    ];
    expect(dedupeSearchEntries(entries).map((e) => `${e.recordType}:${e._id}`)).toEqual([
      "expenseEntry:a",
      "receipt:a",
      "receipt:b",
    ]);
  });
});

describe("partitionExpenseEntriesByKind", () => {
  it("entryType で支出・収入へ厳密に振り分ける", () => {
    const entries = [
      { entryType: "expense" as const, v: 1 },
      { entryType: "income" as const, v: 2 },
      { entryType: "expense" as const, v: 3 },
    ];
    const result = partitionExpenseEntriesByKind(entries);
    expect(result.expenses.map((e) => e.v)).toEqual([1, 3]);
    expect(result.incomes.map((e) => e.v)).toEqual([2]);
  });
});

describe("partitionReceiptsByKind", () => {
  it("type 未設定は支出扱い", () => {
    const receipts = [
      { type: "income" as const, v: 1 },
      { v: 2 },
      { type: "expense" as const, v: 3 },
    ];
    const result = partitionReceiptsByKind(receipts);
    expect(result.expenses.map((r) => r.v)).toEqual([2, 3]);
    expect(result.incomes.map((r) => r.v)).toEqual([1]);
  });
});

describe("mergeSearchEntrySources", () => {
  it("新形式を先に置き、source-qualified IDでdedupeする", () => {
    const merged = mergeSearchEntrySources(
      [{ _id: "n1", recordType: "expenseEntry" }],
      [
        { _id: "n1", recordType: "expenseEntry" },
        { _id: "l1", recordType: "receipt" },
      ],
    );
    expect(merged).toEqual([
      { _id: "n1", recordType: "expenseEntry" },
      { _id: "l1", recordType: "receipt" },
    ]);
  });
});
