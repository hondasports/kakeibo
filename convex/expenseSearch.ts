import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { searchExpensesHandler } from "../lib/convex/expenseSearch/searchExpenses";
import {
  historyEntryTypeValidator,
  historyTrendGranularityValidator,
} from "../lib/convex/expenseSearch/validators";
import { entryKindValidator, recordTypeValidator } from "../lib/convex/receipts/validators";

const expenseSearchReceiptValidator = v.object({
  _id: v.string(),
  date: v.string(),
  type: entryKindValidator,
  shopName: v.optional(v.string()),
  bankName: v.optional(v.string()),
  amountYen: v.number(),
  categoryId: v.optional(v.string()),
  categoryName: v.optional(v.string()),
  categoryColor: v.optional(v.string()),
  memo: v.optional(v.string()),
  recordType: recordTypeValidator,
  itemName: v.optional(v.string()),
  receiptGroupId: v.optional(v.string()),
  receiptShopName: v.optional(v.string()),
  receiptTotalAmountYen: v.optional(v.number()),
});

const historyCategorySummaryValidator = v.object({
  categoryId: v.string(),
  categoryName: v.string(),
  categoryColor: v.string(),
  totalAmountYen: v.number(),
  count: v.number(),
});

const historyAggregateValidator = v.object({
  count: v.number(),
  expenseCount: v.number(),
  incomeCount: v.number(),
  totalExpenseYen: v.number(),
  totalIncomeYen: v.number(),
  netAmountYen: v.number(),
  byCategory: v.array(historyCategorySummaryValidator),
});

const historyComparisonValidator = v.union(
  v.object({
    currentStartDate: v.string(),
    currentEndDate: v.string(),
    previousStartDate: v.string(),
    previousEndDate: v.string(),
    current: historyAggregateValidator,
    previous: historyAggregateValidator,
    diffExpenseYen: v.number(),
    diffIncomeYen: v.number(),
    diffNetYen: v.number(),
    categoryChanges: v.array(
      v.object({
        categoryId: v.string(),
        categoryName: v.string(),
        categoryColor: v.string(),
        currentAmountYen: v.number(),
        previousAmountYen: v.number(),
        diffAmountYen: v.number(),
        diffRatePercent: v.union(v.number(), v.null()),
      }),
    ),
    hasPreviousData: v.boolean(),
  }),
  v.null(),
);

export const searchExpenses = query({
  args: {
    entryType: v.optional(historyEntryTypeValidator),
    shopQuery: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    minAmountYen: v.optional(v.number()),
    maxAmountYen: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(expenseSearchReceiptValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
    truncated: v.boolean(),
    comparisonTruncated: v.boolean(),
    matchedGroupCount: v.number(),
    totalCount: v.number(),
    expenseCount: v.number(),
    incomeCount: v.number(),
    totalExpenseYen: v.number(),
    totalIncomeYen: v.number(),
    netAmountYen: v.number(),
    byCategory: v.array(historyCategorySummaryValidator),
    trend: v.array(
      v.object({
        key: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        granularity: historyTrendGranularityValidator,
        totalExpenseYen: v.number(),
        totalIncomeYen: v.number(),
        netAmountYen: v.number(),
      }),
    ),
    comparison: historyComparisonValidator,
  }),
  handler: searchExpensesHandler,
});
