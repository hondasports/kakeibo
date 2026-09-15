import type { PaginationOptions } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QueryCtx } from "../../../convex/_generated/server";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { buildCategoryInfoMap } from "../receipts/summaryLib/categoryAggregation";
import {
  ExpenseSearchDomainError,
  type ExpenseSearchReceipt,
  type ExpenseSearchResult,
} from "../../domain/expenseSearch/searchResult";
import {
  searchExpenses,
  type ExpenseSearchStore,
} from "../../usecase/expenseSearch/searchExpenses";
import { loadHistoryEntriesForSearch } from "./loadSpendingEntries";

export type { ExpenseSearchReceipt, ExpenseSearchResult };

export type ExpenseSearchArgs = {
  entryType?: "all" | "expense" | "income";
  shopQuery?: string;
  categoryId?: Id<"categories">;
  minAmountYen?: number;
  maxAmountYen?: number;
  startDate?: string;
  endDate?: string;
  paginationOpts: PaginationOptions;
};

function createExpenseSearchStore(ctx: QueryCtx): ExpenseSearchStore {
  return {
    getCategoryGroupId: async (categoryId) =>
      (await ctx.db.get(categoryId as Id<"categories">))?.groupId,
    loadHistoryEntries: (groupId, startDate, endDate) =>
      loadHistoryEntriesForSearch(ctx, groupId as Id<"groups">, startDate, endDate),
    buildCategoryInfoMap: (groupId, categoryIds) =>
      buildCategoryInfoMap(ctx, groupId as Id<"groups">, categoryIds),
  };
}

export async function searchExpensesHandler(
  ctx: QueryCtx,
  args: ExpenseSearchArgs,
): Promise<ExpenseSearchResult> {
  const { groupId } = await requireGroupMembership(ctx);
  try {
    return await searchExpenses(createExpenseSearchStore(ctx), groupId, args);
  } catch (error) {
    if (error instanceof ExpenseSearchDomainError) {
      throw new ConvexError(error.message);
    }
    throw error;
  }
}
