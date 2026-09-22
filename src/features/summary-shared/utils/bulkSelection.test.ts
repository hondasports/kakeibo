import { describe, expect, it } from "vitest";
import type { ReceiptItem } from "../types/types";
import {
  getSpendingSelectionKey,
  getVisibleSelectableReceipts,
  hasMultipleSourceCategories,
  partitionSelectedSpendingIds,
  pruneSelectionToVisibleKeys,
  takeKeysUpToLimit,
} from "./bulkSelection";

const expense = (id: string, categoryId = "food"): ReceiptItem => ({
  _id: id,
  date: "2026-06-15",
  shopName: `店${id}`,
  amountYen: 100,
  categoryId,
  categoryName: "食費",
  categoryColor: "#f97316",
  recordType: "expenseEntry",
});

describe("bulkSelection", () => {
  it("recordType と id で選択キーを分ける", () => {
    expect(
      partitionSelectedSpendingIds([
        getSpendingSelectionKey({ _id: "e1", recordType: "expenseEntry" }),
        getSpendingSelectionKey({ _id: "r1", recordType: "receipt" }),
      ]),
    ).toEqual({
      expenseEntryIds: ["e1"],
      receiptIds: ["r1"],
    });
  });

  it("収入行は選択対象から外す", () => {
    const receipts: ReceiptItem[] = [
      expense("e1"),
      { ...expense("i1"), type: "income", categoryId: "" },
    ];
    expect(getVisibleSelectableReceipts(receipts).map((item) => item._id)).toEqual(["e1"]);
  });

  it("一覧から消えた選択キーを落とす", () => {
    const next = pruneSelectionToVisibleKeys(
      ["expenseEntry:e1", "expenseEntry:e2"],
      ["expenseEntry:e1"],
    );
    expect(Array.from(next)).toEqual(["expenseEntry:e1"]);
  });

  it("上限を超える選択は先頭から切り詰める", () => {
    expect(takeKeysUpToLimit(["expenseEntry:a", "expenseEntry:b", "expenseEntry:c"], 2)).toEqual({
      nextKeys: ["expenseEntry:a", "expenseEntry:b"],
      capped: true,
    });
  });

  it("複数カテゴリの選択を検出する", () => {
    expect(hasMultipleSourceCategories([expense("e1", "food"), expense("e2", "daily")])).toBe(true);
    expect(hasMultipleSourceCategories([expense("e1", "food"), expense("e2", "food")])).toBe(false);
  });
});
