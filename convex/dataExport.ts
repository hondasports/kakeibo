import { v } from "convex/values";
import { query } from "./_generated/server";
import { exportEntriesHandler } from "../lib/convex/dataExport/exportEntries";
import { entryKindValidator } from "../lib/convex/receipts/validators";

export const listExportEntries = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    entryType: v.optional(entryKindValidator),
    expectedGroupId: v.optional(v.id("groups")),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        date: v.string(),
        kind: entryKindValidator,
        title: v.string(),
        categoryName: v.string(),
        amountYen: v.number(),
        memo: v.string(),
      }),
    ),
    truncated: v.boolean(),
    groupId: v.id("groups"),
  }),
  handler: exportEntriesHandler,
});
