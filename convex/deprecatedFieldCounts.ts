import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// Issue #1183: deprecated フィールド撤去の判断材料となる件数だけを返す。
// 戻り値は件数のみで、ユーザー識別子・ドキュメント値は含めない。
//
// 各呼び出しは1 page 分だけを読む独立したトランザクションなので、
// 走査の途中で書き込まれた行はカーソル位置によって計上されたり
// されなかったりする。totals は「走査開始時点の一貫した snapshot」では
// なく「近似の合計」として扱い、件数が閾値ぎりぎりの判断には
// 新規書き込み経路の確認（旧形式を今も生成しないか）を併せて行う。
const BATCH_SIZE = 25;

type ReadCtx = Pick<QueryCtx, "db">;

const paged = (cursor: string | undefined) => ({
  cursor: cursor ?? null,
  numItems: BATCH_SIZE,
});

// markers の read fallback は2種類ある:
// - `markers ?? (taxMarker ? [taxMarker] : [])`（undefined のみ）
// - `item.markers.length > 0 ? item.markers : item.taxMarker ? [item.taxMarker] : []`
//   （interpretReceiptTax。空配列でも taxMarker に落ちる）
// 撤去判断は「undefined または空配列の markers かつ taxMarker 非空」で見る。
const itemCompatCounts = {
  missingPrintedAmountYen: v.number(),
  missingLineType: v.number(),
  missingMarkers: v.number(),
  emptyMarkers: v.number(),
  markersAbsentOrEmptyWithTaxMarker: v.number(),
  withTaxMarker: v.number(),
};

type ItemCompatCounts = {
  missingPrintedAmountYen: number;
  missingLineType: number;
  missingMarkers: number;
  emptyMarkers: number;
  markersAbsentOrEmptyWithTaxMarker: number;
  withTaxMarker: number;
};

const emptyItemCounts = (): ItemCompatCounts => ({
  missingPrintedAmountYen: 0,
  missingLineType: 0,
  missingMarkers: 0,
  emptyMarkers: 0,
  markersAbsentOrEmptyWithTaxMarker: 0,
  withTaxMarker: 0,
});

const mergeItemCounts = (
  carry: ItemCompatCounts | undefined,
  page: ItemCompatCounts,
): ItemCompatCounts => ({
  missingPrintedAmountYen: (carry?.missingPrintedAmountYen ?? 0) + page.missingPrintedAmountYen,
  missingLineType: (carry?.missingLineType ?? 0) + page.missingLineType,
  missingMarkers: (carry?.missingMarkers ?? 0) + page.missingMarkers,
  emptyMarkers: (carry?.emptyMarkers ?? 0) + page.emptyMarkers,
  markersAbsentOrEmptyWithTaxMarker:
    (carry?.markersAbsentOrEmptyWithTaxMarker ?? 0) + page.markersAbsentOrEmptyWithTaxMarker,
  withTaxMarker: (carry?.withTaxMarker ?? 0) + page.withTaxMarker,
});

function countMissingItemFields(
  item: {
    printedAmountYen?: number;
    lineType?: string;
    markers?: string[];
    taxMarker?: string;
  },
  counts: ItemCompatCounts,
) {
  if (item.printedAmountYen === undefined) counts.missingPrintedAmountYen += 1;
  if (item.lineType === undefined) counts.missingLineType += 1;
  const markersEmpty = item.markers !== undefined && item.markers.length === 0;
  if (item.markers === undefined) counts.missingMarkers += 1;
  if (markersEmpty) counts.emptyMarkers += 1;
  const hasTaxMarker = item.taxMarker !== undefined && item.taxMarker !== "";
  if ((item.markers === undefined || markersEmpty) && hasTaxMarker) {
    counts.markersAbsentOrEmptyWithTaxMarker += 1;
  }
  if (hasTaxMarker) counts.withTaxMarker += 1;
}

const itemTableCounts = { scanned: v.number(), ...itemCompatCounts };

type ItemTableCounts = ItemCompatCounts & { scanned: number };

export const aiExpenseDraftItems = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    carry: v.optional(v.object(itemTableCounts)),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    page: v.object(itemTableCounts),
    totals: v.object(itemTableCounts),
  }),
  handler: async (ctx: ReadCtx, args) => {
    const page = await ctx.db.query("aiExpenseDraftItems").paginate(paged(args.cursor));
    const counts: ItemTableCounts = { scanned: 0, ...emptyItemCounts() };
    for (const item of page.page) {
      counts.scanned += 1;
      countMissingItemFields(item, counts);
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      page: counts,
      totals: {
        scanned: (args.carry?.scanned ?? 0) + counts.scanned,
        ...mergeItemCounts(args.carry, counts),
      },
    };
  },
});

const draftCounts = {
  scanned: v.number(),
  missingReceiptDataContractVersion: v.number(),
  withTaxSummaryCorrections: v.number(),
  interpretation: v.object(itemCompatCounts),
  userOverride: v.object(itemCompatCounts),
};

type DraftCounts = {
  scanned: number;
  missingReceiptDataContractVersion: number;
  withTaxSummaryCorrections: number;
  interpretation: ItemCompatCounts;
  userOverride: ItemCompatCounts;
};

export const aiExpenseDrafts = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    carry: v.optional(v.object(draftCounts)),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    page: v.object(draftCounts),
    totals: v.object(draftCounts),
  }),
  handler: async (ctx: ReadCtx, args) => {
    const page = await ctx.db.query("aiExpenseDrafts").paginate(paged(args.cursor));
    const counts: DraftCounts = {
      scanned: 0,
      missingReceiptDataContractVersion: 0,
      withTaxSummaryCorrections: 0,
      interpretation: emptyItemCounts(),
      userOverride: emptyItemCounts(),
    };
    for (const draft of page.page) {
      counts.scanned += 1;
      if (draft.receiptDataContractVersion === undefined) {
        counts.missingReceiptDataContractVersion += 1;
      }
      const corrections = draft.receiptUserOverride?.taxSummaryCorrections;
      if (corrections !== undefined && corrections.length > 0) {
        counts.withTaxSummaryCorrections += 1;
      }
      for (const item of draft.receiptInterpretation?.values.items ?? []) {
        countMissingItemFields(item, counts.interpretation);
      }
      for (const item of draft.receiptUserOverride?.values.items ?? []) {
        countMissingItemFields(item, counts.userOverride);
      }
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      page: counts,
      totals: {
        scanned: (args.carry?.scanned ?? 0) + counts.scanned,
        missingReceiptDataContractVersion:
          (args.carry?.missingReceiptDataContractVersion ?? 0) +
          counts.missingReceiptDataContractVersion,
        withTaxSummaryCorrections:
          (args.carry?.withTaxSummaryCorrections ?? 0) + counts.withTaxSummaryCorrections,
        interpretation: mergeItemCounts(args.carry?.interpretation, counts.interpretation),
        userOverride: mergeItemCounts(args.carry?.userOverride, counts.userOverride),
      },
    };
  },
});

const recordCounts = {
  scanned: v.number(),
  migrated: v.number(),
  skipped: v.number(),
  failed: v.number(),
};

export const groupDeletionAuditMigrationRecords = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    carry: v.optional(v.object(recordCounts)),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    page: v.object(recordCounts),
    totals: v.object(recordCounts),
  }),
  handler: async (ctx: ReadCtx, args) => {
    const page = await ctx.db
      .query("groupDeletionAuditMigrationRecords")
      .paginate(paged(args.cursor));
    const counts = { scanned: 0, migrated: 0, skipped: 0, failed: 0 };
    for (const record of page.page) {
      counts.scanned += 1;
      if (record.status === "migrated") counts.migrated += 1;
      else if (record.status === "skipped") counts.skipped += 1;
      else if (record.status === "failed") counts.failed += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      page: counts,
      totals: {
        scanned: (args.carry?.scanned ?? 0) + counts.scanned,
        migrated: (args.carry?.migrated ?? 0) + counts.migrated,
        skipped: (args.carry?.skipped ?? 0) + counts.skipped,
        failed: (args.carry?.failed ?? 0) + counts.failed,
      },
    };
  },
});
