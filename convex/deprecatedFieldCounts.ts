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

// 埋め込み items（interpretation/userOverride 内）の走査数も runner の
// nested 集計（ITEM_COUNTERS = scanned 込み）と同じ形状で保持する。
const embeddedItemCounts = {
  scanned: v.number(),
  ...itemCompatCounts,
};
type EmbeddedItemCounts = ItemCompatCounts & { scanned: number };
const emptyEmbeddedCounts = (): EmbeddedItemCounts => ({
  scanned: 0,
  ...emptyItemCounts(),
});
const mergeEmbeddedCounts = (
  carry: EmbeddedItemCounts | undefined,
  page: EmbeddedItemCounts,
): EmbeddedItemCounts => ({
  scanned: (carry?.scanned ?? 0) + page.scanned,
  ...mergeItemCounts(carry, page),
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

// printedAmountYen 欠落行に対し、親 draft の receiptInterpretation
// 埋め込み items との突合結果を件数だけで分類する調査クエリ。
//
// 注意（読み方）:
// - source: "ai" の埋め込み items は mapExtractionToDraftArgs の税解釈・
//   分類を通った args.items の投影で、レシート印字原本そのものではない。
//   テーブル行とは別 write 経路の「もう一つの記録」であり、独立した原本
//   証拠としては扱わない。
// - source: "legacy_projection" はテーブル行からの再投影（循環）なので
//   印字額の根拠には使えない。
// - itemName の一意一致・配列 index 一致は行同一性の証明にならない
//   （削除・並べ替え・重複名・再抽出・編集で崩れうる）。一致系カウンタは
//   「値が矛盾しない」程度の整合信号であって、自動 backfill の十分条件に
//   しない。embedded printed 値を埋める場合も行単位の確認が要る。
// - deployWindowStartTs/EndTs は「候補 deploy job の開始〜終了」を外部の
//   CI/deploy 記録から人間が供給する前提のパラメータ。日付バケットは
//   候補 job の時刻に対する位置関係を数えるだけで、本番導入前後や
//   writer 経路を証明しない（workflow 外の反映は未検証）。
//
// カウンタの重なり（合計の読み方）:
// - 欠落行は必ず1つの終端バケットに入る: parentDraftMissing /
//   parentDraftGroupMismatch / interpretationAbsent / interpretationNonAi /
//   interpretationItemsMalformed / siblingsTruncated /
//   rowMissingFromSiblingIndex / ambiguousNameJoinTableSide /
//   noNameOverlap / ambiguousNameJoin / uniqueNameJoin* 3種。
//   これらの合計 === missingPrintedRows。
// - hasUserOverride・siblingCountDiffers・createdAt* は終端バケットと
//   併存する副次フラグ（独立して足し合わせない）。
// - uniqueNameJoinPositionConsistent は uniqueNameJoin* 3種のいずれかに
//   内包される副カウント（3種の合計とは別に読む）。
// - itemName 一致は「埋め込み側が一意」かつ「兄弟行側も一意」の両方が
//   揃ったときだけ uniqueNameJoin とする。片方でも複数一致なら曖昧。
//   embedded item の itemName 欠落・items が配列でない等の malformed は
//   interpretationItemsMalformed、draft の groupId が行と違う場合は
//   parentDraftGroupMismatch で、いずれも「不明」として join しない。
// - deployWindowStartTs/deployWindowEndTs は carry に束縛する。ページ継続で
//   値が変わると累計が混ざるため ConvexError で拒否する（runner は全ページ
//   同一値を JS リテラルへ埋め込むため混在しない）。
// - 日付バケットは「候補 deploy job の窓」に対する位置であって、本番導入前後の
//   証明ではない。beforeStart = 候補 job の開始より前に作られた行で、
//   workflow 外の deploy・以前の反映経路が無かったことはこの件数では分からない。
//   inWindow = job 開始〜終了の間（deploy 前後どちらとも不明）。
const JOIN_EVIDENCE_SIBLING_LIMIT = 101; // DRAFT_JUDGMENT_ITEM_LIMIT(100)+1 で打ち切り検出

const joinEvidenceCounts = {
  scanned: v.number(),
  missingPrintedRows: v.number(),
  createdAtBeforeDeployWindowStart: v.number(),
  createdAtInDeployWindow: v.number(),
  createdAtAtOrAfterDeployWindowEnd: v.number(),
  parentDraftMissing: v.number(),
  parentDraftGroupMismatch: v.number(),
  hasUserOverride: v.number(),
  interpretationAbsent: v.number(),
  interpretationNonAi: v.number(),
  interpretationItemsMalformed: v.number(),
  siblingsTruncated: v.number(),
  rowMissingFromSiblingIndex: v.number(),
  siblingCountDiffers: v.number(),
  ambiguousNameJoinTableSide: v.number(),
  noNameOverlap: v.number(),
  ambiguousNameJoin: v.number(),
  uniqueNameJoinEmbeddedPrintedMissing: v.number(),
  uniqueNameJoinPrintedEqualsAmount: v.number(),
  uniqueNameJoinPrintedDiffers: v.number(),
  uniqueNameJoinPositionConsistent: v.number(),
};

type JoinEvidenceCounts = {
  scanned: number;
  missingPrintedRows: number;
  createdAtBeforeDeployWindowStart: number;
  createdAtInDeployWindow: number;
  createdAtAtOrAfterDeployWindowEnd: number;
  parentDraftMissing: number;
  parentDraftGroupMismatch: number;
  hasUserOverride: number;
  interpretationAbsent: number;
  interpretationNonAi: number;
  interpretationItemsMalformed: number;
  siblingsTruncated: number;
  rowMissingFromSiblingIndex: number;
  siblingCountDiffers: number;
  ambiguousNameJoinTableSide: number;
  noNameOverlap: number;
  ambiguousNameJoin: number;
  uniqueNameJoinEmbeddedPrintedMissing: number;
  uniqueNameJoinPrintedEqualsAmount: number;
  uniqueNameJoinPrintedDiffers: number;
  uniqueNameJoinPositionConsistent: number;
};

const emptyJoinEvidenceCounts = (): JoinEvidenceCounts => ({
  scanned: 0,
  missingPrintedRows: 0,
  createdAtBeforeDeployWindowStart: 0,
  createdAtInDeployWindow: 0,
  createdAtAtOrAfterDeployWindowEnd: 0,
  parentDraftMissing: 0,
  parentDraftGroupMismatch: 0,
  hasUserOverride: 0,
  interpretationAbsent: 0,
  interpretationNonAi: 0,
  interpretationItemsMalformed: 0,
  siblingsTruncated: 0,
  rowMissingFromSiblingIndex: 0,
  siblingCountDiffers: 0,
  ambiguousNameJoinTableSide: 0,
  noNameOverlap: 0,
  ambiguousNameJoin: 0,
  uniqueNameJoinEmbeddedPrintedMissing: 0,
  uniqueNameJoinPrintedEqualsAmount: 0,
  uniqueNameJoinPrintedDiffers: 0,
  uniqueNameJoinPositionConsistent: 0,
});

// carry は合計 counts に加えて最初のページで使った deployWindow 境界を束縛
// する。継続呼び出しで値が変わると日付バケットの累計が混ざるので拒否する。
const joinEvidenceCarry = v.object({
  counts: v.object(joinEvidenceCounts),
  deployWindowStartTs: v.optional(v.number()),
  deployWindowEndTs: v.optional(v.number()),
});

// schema では malformed な埋め込み（itemName 非文字列等）を再現できないため、
// テストが直接呼べるよう export する。本クエリの判定ロジックはここに集約。
export function classifyJoinEvidence(
  item: {
    _id: string;
    groupId: string;
    draftId: string;
    itemName: string;
    amountYen: number;
    createdAt: number;
  },
  draft: {
    groupId: string;
    receiptUserOverride?: unknown;
    receiptInterpretation?: {
      source: string;
      values?: { items?: unknown };
    };
  } | null,
  // siblings は null のとき打ち切り（上限超過で完全な列挙が取れていない）。
  siblings: { _id: string; itemName?: unknown }[] | null,
  // deployWindowEndTs 未指定時は [start, start) の空窓として扱い、
  // inWindow=0・start 以降は全て atOrAfterEnd に入る。
  deployWindowStartTs: number | undefined,
  deployWindowEndTs: number | undefined,
  counts: JoinEvidenceCounts,
) {
  counts.missingPrintedRows += 1;
  if (deployWindowStartTs !== undefined) {
    const windowEnd = deployWindowEndTs ?? deployWindowStartTs;
    if (item.createdAt < deployWindowStartTs) {
      counts.createdAtBeforeDeployWindowStart += 1;
    } else if (item.createdAt < windowEnd) {
      counts.createdAtInDeployWindow += 1;
    } else {
      counts.createdAtAtOrAfterDeployWindowEnd += 1;
    }
  }
  if (draft === null) {
    counts.parentDraftMissing += 1;
    return;
  }
  // 親 draft の groupId が行と違う場合は参照先を信用できない（不明扱い）。
  if (draft.groupId !== item.groupId) {
    counts.parentDraftGroupMismatch += 1;
    return;
  }
  if (draft.receiptUserOverride !== undefined) counts.hasUserOverride += 1;
  const interpretation = draft.receiptInterpretation;
  if (interpretation === undefined) {
    counts.interpretationAbsent += 1;
    return;
  }
  if (interpretation.source !== "ai") {
    counts.interpretationNonAi += 1;
    return;
  }
  // items が配列でない・要素がオブジェクトでない・itemName が文字列でない
  // 埋め込みは「名前での対応付け自体が不確か」なので join しない。
  const embeddedRaw = interpretation.values?.items;
  if (
    !Array.isArray(embeddedRaw) ||
    embeddedRaw.some(
      (e) =>
        typeof e !== "object" ||
        e === null ||
        typeof (e as { itemName?: unknown }).itemName !== "string",
    )
  ) {
    counts.interpretationItemsMalformed += 1;
    return;
  }
  const embedded = embeddedRaw as { itemName: string; printedAmountYen?: number }[];
  if (siblings === null) {
    counts.siblingsTruncated += 1;
    return;
  }
  const rowIndex = siblings.findIndex((s) => s._id === item._id);
  if (rowIndex === -1) {
    counts.rowMissingFromSiblingIndex += 1;
    return;
  }
  if (embedded.length !== siblings.length) counts.siblingCountDiffers += 1;
  // 行の特定は両側で一意なことが条件。兄弟側に同名が複数あれば、
  // 埋め込み側が1件でも複数行が同じ snapshot item を指してしまう。
  const sameNameSiblings = siblings.filter((s) => s.itemName === item.itemName);
  if (sameNameSiblings.length > 1) {
    counts.ambiguousNameJoinTableSide += 1;
    return;
  }
  const nameMatches = embedded
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.itemName === item.itemName);
  if (nameMatches.length === 0) {
    counts.noNameOverlap += 1;
    return;
  }
  if (nameMatches.length > 1) {
    counts.ambiguousNameJoin += 1;
    return;
  }
  const [{ e, i }] = nameMatches;
  if (i === rowIndex) counts.uniqueNameJoinPositionConsistent += 1;
  if (e.printedAmountYen === undefined) {
    counts.uniqueNameJoinEmbeddedPrintedMissing += 1;
  } else if (e.printedAmountYen === item.amountYen) {
    counts.uniqueNameJoinPrintedEqualsAmount += 1;
  } else {
    counts.uniqueNameJoinPrintedDiffers += 1;
  }
}

export const printedAmountJoinEvidence = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    carry: v.optional(joinEvidenceCarry),
    deployWindowStartTs: v.optional(v.number()),
    deployWindowEndTs: v.optional(v.number()),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    page: v.object(joinEvidenceCounts),
    totals: v.object(joinEvidenceCounts),
  }),
  handler: async (ctx: ReadCtx, args) => {
    assertCursorCarryPair(args.cursor, args.carry);
    if (args.deployWindowEndTs !== undefined) {
      if (
        args.deployWindowStartTs === undefined ||
        args.deployWindowEndTs < args.deployWindowStartTs
      ) {
        throw new ConvexError(
          "deployWindowEndTs は deployWindowStartTs と同時に、それ以降の値で指定してください",
        );
      }
    }
    if (
      args.carry !== undefined &&
      (args.carry.deployWindowStartTs !== args.deployWindowStartTs ||
        args.carry.deployWindowEndTs !== args.deployWindowEndTs)
    ) {
      throw new ConvexError(
        "継続ページで deployWindow の境界が変わっています。日付バケットの累計が混ざるため、全ページ同一値を指定してください",
      );
    }
    const page = await ctx.db.query("aiExpenseDraftItems").paginate(paged(args.cursor));
    const counts = emptyJoinEvidenceCounts();
    for (const item of page.page) {
      counts.scanned += 1;
      if (item.printedAmountYen !== undefined) continue;
      const draft = await ctx.db.get(item.draftId);
      // draft が無い・別 group・source が "ai" でない行は sibling 列挙が
      // 不要なので、先に draft だけ見てから取得要否を決める（読み取り量を抑える）。
      const needsSiblings =
        draft !== null &&
        draft.groupId === item.groupId &&
        draft.receiptInterpretation?.source === "ai";
      const siblings = needsSiblings
        ? await ctx.db
            .query("aiExpenseDraftItems")
            .withIndex("by_group_id_and_draft_id", (q) =>
              q.eq("groupId", item.groupId).eq("draftId", item.draftId),
            )
            .take(JOIN_EVIDENCE_SIBLING_LIMIT)
        : null;
      classifyJoinEvidence(
        item,
        draft,
        siblings !== null && siblings.length >= JOIN_EVIDENCE_SIBLING_LIMIT ? null : siblings,
        args.deployWindowStartTs,
        args.deployWindowEndTs,
        counts,
      );
    }
    const totals = emptyJoinEvidenceCounts();
    const carryCounts: JoinEvidenceCounts | undefined = args.carry?.counts;
    for (const key of Object.keys(totals) as (keyof JoinEvidenceCounts)[]) {
      totals[key] = (carryCounts?.[key] ?? 0) + counts[key];
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      page: counts,
      totals,
    };
  },
});

const draftCounts = {
  scanned: v.number(),
  missingReceiptDataContractVersion: v.number(),
  withTaxSummaryCorrections: v.number(),
  // taxSummaryCorrections は現行 writer が非空のときだけ書く
  // （buildReceiptUserOverride の `?.length` 条件）。存在して空なら
  // ダッシュボード編集・import・旧コード等の未確認 writer の手がかり。
  // resolveReceiptTaxCorrections は「存在」で早期 return するため、
  // 空配列は派生訂正を抑制する点で欠落と意味が違う。
  taxSummaryCorrectionsPresent: v.number(),
  taxSummaryCorrectionsPresentEmpty: v.number(),
  interpretationSourceAi: v.number(),
  interpretationSourceLegacyProjection: v.number(),
  interpretationAbsent: v.number(),
  // values.items が配列でない保存形状は items 0件と見なさず malformed で
  // 可視化する（runner inline query の nested() と同じ判定）。
  interpretationMalformed: v.number(),
  userOverrideMalformed: v.number(),
  interpretation: v.object(embeddedItemCounts),
  userOverride: v.object(embeddedItemCounts),
};

type DraftCounts = {
  scanned: number;
  missingReceiptDataContractVersion: number;
  withTaxSummaryCorrections: number;
  taxSummaryCorrectionsPresent: number;
  taxSummaryCorrectionsPresentEmpty: number;
  interpretationSourceAi: number;
  interpretationSourceLegacyProjection: number;
  interpretationAbsent: number;
  interpretationMalformed: number;
  userOverrideMalformed: number;
  interpretation: EmbeddedItemCounts;
  userOverride: EmbeddedItemCounts;
};

// container === undefined → "absent"（欠落は malformed と区別する）。
// container が null・非オブジェクト・values.items が配列でない → "malformed"。
const embeddedItemsOf = (container: unknown): unknown[] | "absent" | "malformed" => {
  if (container === undefined) return "absent";
  const items = (container as { values?: { items?: unknown } } | null)?.values?.items;
  return Array.isArray(items) ? items : "malformed";
};

const countEmbeddedItems = (
  items: unknown[] | "absent" | "malformed",
  counts: EmbeddedItemCounts,
): "absent" | "malformed" | "counted" => {
  if (items === "absent") return "absent";
  if (items === "malformed") return "malformed";
  for (const item of items) {
    counts.scanned += 1;
    countMissingItemFields(item as Parameters<typeof countMissingItemFields>[0], counts);
  }
  return "counted";
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
      taxSummaryCorrectionsPresent: 0,
      taxSummaryCorrectionsPresentEmpty: 0,
      interpretationSourceAi: 0,
      interpretationSourceLegacyProjection: 0,
      interpretationAbsent: 0,
      interpretationMalformed: 0,
      userOverrideMalformed: 0,
      interpretation: emptyEmbeddedCounts(),
      userOverride: emptyEmbeddedCounts(),
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
      if (corrections !== undefined) {
        counts.taxSummaryCorrectionsPresent += 1;
        if (corrections.length === 0) counts.taxSummaryCorrectionsPresentEmpty += 1;
      }
      const source = draft.receiptInterpretation?.source;
      if (source === "ai") counts.interpretationSourceAi += 1;
      else if (source === "legacy_projection") {
        counts.interpretationSourceLegacyProjection += 1;
      } else counts.interpretationAbsent += 1;
      if (
        countEmbeddedItems(embeddedItemsOf(draft.receiptInterpretation), counts.interpretation) ===
        "malformed"
      ) {
        counts.interpretationMalformed += 1;
      }
      if (
        countEmbeddedItems(embeddedItemsOf(draft.receiptUserOverride), counts.userOverride) ===
        "malformed"
      ) {
        counts.userOverrideMalformed += 1;
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
        taxSummaryCorrectionsPresent:
          (args.carry?.taxSummaryCorrectionsPresent ?? 0) + counts.taxSummaryCorrectionsPresent,
        taxSummaryCorrectionsPresentEmpty:
          (args.carry?.taxSummaryCorrectionsPresentEmpty ?? 0) +
          counts.taxSummaryCorrectionsPresentEmpty,
        interpretationSourceAi:
          (args.carry?.interpretationSourceAi ?? 0) + counts.interpretationSourceAi,
        interpretationSourceLegacyProjection:
          (args.carry?.interpretationSourceLegacyProjection ?? 0) +
          counts.interpretationSourceLegacyProjection,
        interpretationAbsent: (args.carry?.interpretationAbsent ?? 0) + counts.interpretationAbsent,
        interpretationMalformed:
          (args.carry?.interpretationMalformed ?? 0) + counts.interpretationMalformed,
        userOverrideMalformed:
          (args.carry?.userOverrideMalformed ?? 0) + counts.userOverrideMalformed,
        interpretation: mergeEmbeddedCounts(args.carry?.interpretation, counts.interpretation),
        userOverride: mergeEmbeddedCounts(args.carry?.userOverride, counts.userOverride),
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
