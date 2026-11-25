import { v } from "convex/values";
import { SAVED_EXPENSE_SEARCH_KINDS } from "../../domain/savedExpenseSearches/savedExpenseSearch";

export const savedExpenseSearchKindValidator = v.union(
  ...SAVED_EXPENSE_SEARCH_KINDS.map((kind) => v.literal(kind)),
);
