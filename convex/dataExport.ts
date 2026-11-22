import { v } from "convex/values";
import { query } from "./_generated/server";
import { exportEntriesHandler } from "../lib/convex/dataExport/exportEntries";

export const listExportEntries = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    entryType: v.optional(v.union(v.literal("expense"), v.literal("income"))),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        date: v.string(),
        kind: v.union(v.literal("expense"), v.literal("income")),
        title: v.string(),
        categoryName: v.string(),
        amountYen: v.number(),
        memo: v.string(),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: exportEntriesHandler,
});
