import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// Issue #1183: deprecated フィールド撤去の判断材料となる件数だけを返す。
// 戻り値は件数のみで、ユーザー識別子・ドキュメント値は含めない。
//
// 使い方（convex run、cursor と carry は常にセットで渡す）:
//   1. `convex run deprecatedFieldCounts:<table> '{}'`
//   2. `continueCursor` が null になるまで
//      `'{"cursor":"<前回のcontinueCursor>","carry":<前回のtotals>}'` で継続
//   3. 最後の呼び出しの `totals` が全件の合算。`isDone: true` を確認する
// cursor だけを渡すと途中ページの件数が消えて totals が最終 page のみに
// なるため、片方だけの指定はエラーにする（fail-closed）。
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

// cursor だけ継続に渡すと carry が未指定になり totals が最終 page の
// 件数だけになる。先頭からやり直せば安全なので、片方欠落は拒否する。
const assertCursorCarryPair = (cursor: string | undefined, carry: unknown) => {
  if ((cursor === undefined) !== (carry === undefined)) {
    throw new ConvexError(
      "cursor と carry は両方指定するか両方省略すること（先頭から走査し直せば安全）",
    );
  }
};

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

// printedAmountYen 欠落行の分類カウンタ（テーブル行のみ。埋め込み snapshot は
// createdAt/updatedAt を持たないため対象外）。
// 目的は欠落行を「さらに行レベルの証拠が要るもの」と「追加調査候補」に分ける
// ことであり、同値証明・backfill 許可ではない。特に
// missingPrintedAmountYenInvestigationCandidates は「normalized・税パイプライン
// 由来フィールド・更新痕跡が見当たらない行」であって、amountYen が印字額と
// 同値であることの証明ではない（旧 deploy・ダッシュボード編集・一発 mutation・
// import 等の来歴はこの件数では分からない）。
const printedInvestigationCounts = {
  missingPrintedAmountYenWithNormalized: v.number(),
  missingPrintedAmountYenWithTaxFields: v.number(),
  missingPrintedAmountYenModifiedAfterInsert: v.number(),
  missingPrintedAmountYenInvestigationCandidates: v.number(),
};

type PrintedInvestigationCounts = {
  missingPrintedAmountYenWithNormalized: number;
  missingPrintedAmountYenWithTaxFields: number;
  missingPrintedAmountYenModifiedAfterInsert: number;
  missingPrintedAmountYenInvestigationCandidates: number;
};

const emptyPrintedInvestigationCounts = (): PrintedInvestigationCounts => ({
  missingPrintedAmountYenWithNormalized: 0,
  missingPrintedAmountYenWithTaxFields: 0,
  missingPrintedAmountYenModifiedAfterInsert: 0,
  missingPrintedAmountYenInvestigationCandidates: 0,
});

function classifyMissingPrintedRow(
  item: {
    printedAmountYen?: number;
    normalizedAmountYen?: number;
    amountBasis?: string;
    taxRatePercent?: number | null;
    allocatedTaxYen?: number;
    taxAllocationStatus?: string;
    taxResolutionStatus?: string;
    taxResolutionSource?: string;
    taxReviewReasons?: string[];
    taxConfirmedFields?: string[];
    taxMarker?: string;
    createdAt: number;
    updatedAt: number;
  },
  counts: PrintedInvestigationCounts,
) {
  if (item.printedAmountYen !== undefined) return;
  const hasNormalized = item.normalizedAmountYen !== undefined;
  const hasTaxFields =
    item.amountBasis !== undefined ||
    item.taxRatePercent !== undefined ||
    item.allocatedTaxYen !== undefined ||
    item.taxAllocationStatus !== undefined ||
    item.taxResolutionStatus !== undefined ||
    item.taxResolutionSource !== undefined ||
    (item.taxReviewReasons?.length ?? 0) > 0 ||
    (item.taxConfirmedFields?.length ?? 0) > 0 ||
    (item.taxMarker !== undefined && item.taxMarker !== "");
  // updatedAt === createdAt は「既知の writer が updatedAt を更新する」前提の
  // 手がかりにすぎず、コード履歴外の書き込みは検出できない。
  const modifiedAfterInsert = item.updatedAt !== item.createdAt;
  if (hasNormalized) counts.missingPrintedAmountYenWithNormalized += 1;
  if (hasTaxFields) counts.missingPrintedAmountYenWithTaxFields += 1;
  if (modifiedAfterInsert) counts.missingPrintedAmountYenModifiedAfterInsert += 1;
  if (!hasNormalized && !hasTaxFields && !modifiedAfterInsert) {
    counts.missingPrintedAmountYenInvestigationCandidates += 1;
  }
}

const itemTableCounts = {
  scanned: v.number(),
  ...itemCompatCounts,
  ...printedInvestigationCounts,
};

type ItemTableCounts = ItemCompatCounts & PrintedInvestigationCounts & { scanned: number };

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
    assertCursorCarryPair(args.cursor, args.carry);
    const page = await ctx.db.query("aiExpenseDraftItems").paginate(paged(args.cursor));
    const counts: ItemTableCounts = {
      scanned: 0,
      ...emptyItemCounts(),
      ...emptyPrintedInvestigationCounts(),
    };
    for (const item of page.page) {
      counts.scanned += 1;
      countMissingItemFields(item, counts);
      classifyMissingPrintedRow(item, counts);
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      page: counts,
      totals: {
        scanned: (args.carry?.scanned ?? 0) + counts.scanned,
        ...mergeItemCounts(args.carry, counts),
        missingPrintedAmountYenWithNormalized:
          (args.carry?.missingPrintedAmountYenWithNormalized ?? 0) +
          counts.missingPrintedAmountYenWithNormalized,
        missingPrintedAmountYenWithTaxFields:
          (args.carry?.missingPrintedAmountYenWithTaxFields ?? 0) +
          counts.missingPrintedAmountYenWithTaxFields,
        missingPrintedAmountYenModifiedAfterInsert:
          (args.carry?.missingPrintedAmountYenModifiedAfterInsert ?? 0) +
          counts.missingPrintedAmountYenModifiedAfterInsert,
        missingPrintedAmountYenInvestigationCandidates:
          (args.carry?.missingPrintedAmountYenInvestigationCandidates ?? 0) +
          counts.missingPrintedAmountYenInvestigationCandidates,
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
    assertCursorCarryPair(args.cursor, args.carry);
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
    assertCursorCarryPair(args.cursor, args.carry);
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
