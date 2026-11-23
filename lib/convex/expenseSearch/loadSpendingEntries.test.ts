import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  filterHistoryGroups,
  groupHistoryEntries,
  UNCATEGORIZED_CATEGORY_ID,
} from "../../domain/expenseSearch/filter";
import { loadHistoryEntriesForSearch } from "./loadSpendingEntries";
import { createQueryCtx, groupId, makeExpenseEntry } from "../receipts/testHelpers";

// カテゴリ未設定の記録は「未分類」の棚卸し対象として検索結果に残す。
// 月次・週次の集計経路（mapExpenseEntriesToReceiptLinkages）はこの記録で
// missing_category を投げるため、検索で見つけ出す口を残している。
describe("loadHistoryEntriesForSearch", () => {
  it("カテゴリ未設定の支出を未分類の絞り込みで見つけられる", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e-uncategorized" as Id<"expenseEntries">,
          categoryId: undefined,
        }),
        makeExpenseEntry({ _id: "e-food" as Id<"expenseEntries"> }),
      ],
    });

    const { entries } = await loadHistoryEntriesForSearch(ctx, groupId);
    const uncategorized = entries.find((entry) => entry._id === "e-uncategorized");
    expect(uncategorized?.categoryId).toBe("");

    const groups = groupHistoryEntries(entries, []);
    const filtered = filterHistoryGroups(groups, {
      entryType: "expense",
      categoryId: UNCATEGORIZED_CATEGORY_ID,
    });
    expect(filtered.map((group) => group.items.map((item) => item._id))).toEqual([
      ["e-uncategorized"],
    ]);
  });
});
