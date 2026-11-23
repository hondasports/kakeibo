import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  deleteSavedExpenseSearchHandler,
  recordRecentExpenseSearchHandler,
  saveExpenseSearchHandler,
} from "../../lib/convex/savedExpenseSearches/savedExpenseSearchHandlers";

export {
  deleteSavedExpenseSearchHandler,
  recordRecentExpenseSearchHandler,
  saveExpenseSearchHandler,
};

export const saveExpenseSearch = mutation({
  args: {
    name: v.string(),
    query: v.string(),
  },
  returns: v.id("savedExpenseSearches"),
  handler: saveExpenseSearchHandler,
});

export const recordRecentExpenseSearch = mutation({
  args: {
    query: v.string(),
  },
  returns: v.union(v.id("savedExpenseSearches"), v.null()),
  handler: recordRecentExpenseSearchHandler,
});

export const deleteSavedExpenseSearch = mutation({
  args: {
    savedExpenseSearchId: v.id("savedExpenseSearches"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteSavedExpenseSearchHandler(ctx, args);
    return null;
  },
});
