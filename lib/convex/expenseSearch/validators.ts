import { v } from "convex/values";
import { HISTORY_ENTRY_TYPES } from "../../domain/expenseSearch/filter";
import { HISTORY_TREND_GRANULARITIES } from "../../domain/expenseSearch/analytics";

export const historyEntryTypeValidator = v.union(
  ...HISTORY_ENTRY_TYPES.map((entryType) => v.literal(entryType)),
);

export const historyTrendGranularityValidator = v.union(
  ...HISTORY_TREND_GRANULARITIES.map((granularity) => v.literal(granularity)),
);
