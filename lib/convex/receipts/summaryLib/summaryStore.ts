import type { QueryCtx } from "../../../../convex/_generated/server";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  getMonthIncomeEntries,
  getMonthSpendingEntries,
  getWeekIncomeEntries,
  getWeekSpendingEntries,
  getYearAggregationEntries,
} from "../../../../convex/receipts/spendingEntries";
import type { SummaryStore } from "../../../usecase/receipts/summaries";
import { buildCategoryInfoMap } from "./categoryAggregation";

export function createSummaryStore(ctx: QueryCtx): SummaryStore {
  return {
    getWeekSpendingEntries: (groupId, weekStartDate) =>
      getWeekSpendingEntries(ctx, groupId as Id<"groups">, weekStartDate),
    getWeekIncomeEntries: (groupId, weekStartDate) =>
      getWeekIncomeEntries(ctx, groupId as Id<"groups">, weekStartDate),
    getMonthSpendingEntries: (groupId, monthStartDate) =>
      getMonthSpendingEntries(ctx, groupId as Id<"groups">, monthStartDate),
    getMonthIncomeEntries: (groupId, monthStartDate) =>
      getMonthIncomeEntries(ctx, groupId as Id<"groups">, monthStartDate),
    getYearAggregationEntries: (groupId, year) =>
      getYearAggregationEntries(ctx, groupId as Id<"groups">, year),
    buildCategoryInfoMap: (groupId, categoryIds) =>
      buildCategoryInfoMap(ctx, groupId as Id<"groups">, categoryIds),
  };
}
