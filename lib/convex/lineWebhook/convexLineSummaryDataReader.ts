/**
 * LineSummaryDataReader の Convex 実装。
 * 週次エントリ・カテゴリ情報は receipts 側の既存 adapter 関数へ委譲する。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { getWeekIncomeEntries, getWeekSpendingEntries } from "../receipts/spendingEntries";
import { buildCategoryInfoMap } from "../receipts/summaryLib/categoryAggregation";
import type { LineSummaryDataReader } from "../../domain/lineWebhook/summaryDataReader";

export function createLineSummaryDataReader(ctx: Pick<QueryCtx, "db">): LineSummaryDataReader {
  return {
    getWeekSpendingEntries: (groupId, weekStartDate) =>
      getWeekSpendingEntries(ctx as QueryCtx, groupId as Id<"groups">, weekStartDate),
    getWeekIncomeEntries: (groupId, weekStartDate) =>
      getWeekIncomeEntries(ctx as QueryCtx, groupId as Id<"groups">, weekStartDate),
    buildCategoryInfoMap: (groupId, categoryIds) =>
      buildCategoryInfoMap(ctx as QueryCtx, groupId as Id<"groups">, categoryIds),
    async listActiveCategories(groupId, limit) {
      const categories = await ctx.db
        .query("categories")
        .withIndex("by_group_id_and_is_active_and_sort_order", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("isActive", true),
        )
        .take(limit);
      return categories.map((category) => ({
        id: category._id,
        name: category.name,
        ...(category.description === undefined ? {} : { description: category.description }),
      }));
    },
  };
}
