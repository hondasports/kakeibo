import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  createExpenseEntriesFromDraftHandler,
  type CreateExpenseEntriesFromDraftArgs,
} from "../../lib/convex/expenseEntries/createFromDraft";
import {
  createExpenseEntriesHandler,
  createIncomeEntryHandler,
  deleteExpenseEntryHandler,
  updateExpenseEntryHandler,
} from "../../lib/convex/expenseEntries/expenseEntryHandlers";
import {
  bulkDeleteSpendingRecordsHandler,
  bulkUpdateSpendingCategoriesHandler,
} from "../../lib/convex/spending/bulkOpsHandlers";

// テスト・他モジュール互換のためハンドラを再公開する
export {
  createExpenseEntriesHandler,
  createIncomeEntryHandler,
  deleteExpenseEntryHandler,
  updateExpenseEntryHandler,
  createExpenseEntriesFromDraftHandler,
  type CreateExpenseEntriesFromDraftArgs,
  bulkDeleteSpendingRecordsHandler,
  bulkUpdateSpendingCategoriesHandler,
};

export const createIncomeEntry = mutation({
  args: { date: v.string(), amountYen: v.number(), title: v.string() },
  returns: v.id("expenseEntries"),
  handler: createIncomeEntryHandler,
});

export const createExpenseEntries = mutation({
  args: {
    date: v.string(),
    shopName: v.optional(v.string()),
    sourceAmountYen: v.optional(v.number()),
    sourceDocumentId: v.optional(v.id("sourceDocuments")),
    items: v.array(
      v.object({
        categoryId: v.id("categories"),
        amountYen: v.number(),
        title: v.string(),
        memo: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await createExpenseEntriesHandler(ctx, args);
  },
});

export const createExpenseEntriesFromDraft = mutation({
  args: {
    draftId: v.id("aiExpenseDrafts"),
    items: v.array(
      v.object({
        itemName: v.optional(v.string()),
        amountYen: v.number(),
        categoryId: v.optional(v.id("categories")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    return await createExpenseEntriesFromDraftHandler(ctx, args);
  },
});

export const updateExpenseEntry = mutation({
  args: {
    expenseEntryId: v.id("expenseEntries"),
    date: v.optional(v.string()),
    amountYen: v.optional(v.number()),
    categoryId: v.optional(v.id("categories")),
    title: v.optional(v.string()),
    memo: v.optional(v.string()),
  },
  returns: v.id("expenseEntries"),
  handler: async (ctx, args) => {
    return await updateExpenseEntryHandler(ctx, args);
  },
});

export const deleteExpenseEntry = mutation({
  args: {
    expenseEntryId: v.id("expenseEntries"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteExpenseEntryHandler(ctx, args);
    return null;
  },
});

export const bulkUpdateSpendingCategories = mutation({
  args: {
    expenseEntryIds: v.array(v.id("expenseEntries")),
    receiptIds: v.array(v.id("receipts")),
    categoryId: v.id("categories"),
  },
  returns: v.object({ updatedCount: v.number() }),
  handler: async (ctx, args) => {
    return await bulkUpdateSpendingCategoriesHandler(ctx, args);
  },
});

export const bulkDeleteSpendingRecords = mutation({
  args: {
    expenseEntryIds: v.array(v.id("expenseEntries")),
    receiptIds: v.array(v.id("receipts")),
  },
  returns: v.object({ deletedCount: v.number() }),
  handler: async (ctx, args) => {
    return await bulkDeleteSpendingRecordsHandler(ctx, args);
  },
});
