import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// Issue #1183: deprecated フィールド撤去の判断材料となる件数だけを返す。
// 戻り値は件数のみで、ユーザー識別子・ドキュメント値は含めない。
const BATCH_SIZE = 25;

type ReadCtx = Pick<QueryCtx, "db">;

const paged = (cursor: string | undefined) => ({
  cursor: cursor ?? null,
  numItems: BATCH_SIZE,
});

const missingItemCounts = {
  missingPrintedAmountYen: v.number(),
  missingLineType: v.number(),
  missingMarkers: v.number(),
  missingMarkersWithTaxMarker: v.number(),
};

function countMissingItemFields(
  item: {
    printedAmountYen?: number;
    lineType?: string;
    markers?: string[];
    taxMarker?: string;
  },
  counts: {
    missingPrintedAmountYen: number;
    missingLineType: number;
    missingMarkers: number;
    missingMarkersWithTaxMarker: number;
  },
) {
  if (item.printedAmountYen === undefined) counts.missingPrintedAmountYen += 1;
  if (item.lineType === undefined) counts.missingLineType += 1;
  if (item.markers === undefined) {
    counts.missingMarkers += 1;
    if (item.taxMarker !== undefined && item.taxMarker !== "") {
      counts.missingMarkersWithTaxMarker += 1;
    }
  }
}

export const aiExpenseDraftItems = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    scanned: v.number(),
    ...missingItemCounts,
    withTaxMarker: v.number(),
  }),
  handler: async (ctx: ReadCtx, args) => {
    const page = await ctx.db.query("aiExpenseDraftItems").paginate(paged(args.cursor));
    const counts = {
      scanned: 0,
      missingPrintedAmountYen: 0,
      missingLineType: 0,
      missingMarkers: 0,
      missingMarkersWithTaxMarker: 0,
      withTaxMarker: 0,
    };
    for (const item of page.page) {
      counts.scanned += 1;
      countMissingItemFields(item, counts);
      if (item.taxMarker !== undefined && item.taxMarker !== "") counts.withTaxMarker += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      ...counts,
    };
  },
});

export const aiExpenseDrafts = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    scanned: v.number(),
    missingReceiptDataContractVersion: v.number(),
    withTaxSummaryCorrections: v.number(),
    interpretation: v.object(missingItemCounts),
    userOverride: v.object(missingItemCounts),
  }),
  handler: async (ctx: ReadCtx, args) => {
    const page = await ctx.db.query("aiExpenseDrafts").paginate(paged(args.cursor));
    const interpretation = {
      missingPrintedAmountYen: 0,
      missingLineType: 0,
      missingMarkers: 0,
      missingMarkersWithTaxMarker: 0,
    };
    const userOverride = { ...interpretation };
    let missingReceiptDataContractVersion = 0;
    let withTaxSummaryCorrections = 0;
    for (const draft of page.page) {
      if (draft.receiptDataContractVersion === undefined) {
        missingReceiptDataContractVersion += 1;
      }
      const corrections = draft.receiptUserOverride?.taxSummaryCorrections;
      if (corrections !== undefined && corrections.length > 0) {
        withTaxSummaryCorrections += 1;
      }
      for (const item of draft.receiptInterpretation?.values.items ?? []) {
        countMissingItemFields(item, interpretation);
      }
      for (const item of draft.receiptUserOverride?.values.items ?? []) {
        countMissingItemFields(item, userOverride);
      }
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      scanned: page.page.length,
      missingReceiptDataContractVersion,
      withTaxSummaryCorrections,
      interpretation,
      userOverride,
    };
  },
});

export const groupDeletionAuditMigrationRecords = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    scanned: v.number(),
    migrated: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx: ReadCtx, args) => {
    const page = await ctx.db
      .query("groupDeletionAuditMigrationRecords")
      .paginate(paged(args.cursor));
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    for (const record of page.page) {
      if (record.status === "migrated") migrated += 1;
      else if (record.status === "skipped") skipped += 1;
      else if (record.status === "failed") failed += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      scanned: page.page.length,
      migrated,
      skipped,
      failed,
    };
  },
});
