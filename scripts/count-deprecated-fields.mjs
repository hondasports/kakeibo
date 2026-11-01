#!/usr/bin/env node
/**
 * Issue #1183: deprecated フィールド撤去の判断材料となる本番件数を、
 * `--inline-query`（read-only sandbox・deploy 不要）で1ページずつ数える。
 *
 * ・戻り値は件数のみで、ドキュメント値・ユーザー識別子は出力しない。
 * ・`for await` の無制限走査は使わず、1呼び出し = 上限付き1ページで、
 *   continueCursor と累計値を次呼び出しの JS にリテラル埋め込みする
 *   （`--inline-query` は引数を取れないため）。
 * ・各呼び出しは別トランザクションなので最終 totals は近似の合計。
 *   0件だけを撤去根拠にせず、新規書き込み経路の確認と併せて判断する。
 * ・対象 deployment の明示指定を必須にする（無指定の暗黙 dev は拒否）。
 * ・エラー・不正出力・上限超過では即座に非0終了する（fail-closed）。
 *
 * 使い方:
 *   node scripts/count-deprecated-fields.mjs --prod
 *   node scripts/count-deprecated-fields.mjs --deployment <ref>
 *   node scripts/count-deprecated-fields.mjs --dev        # 既定 deployment（.env.local）
 *   node scripts/count-deprecated-fields.mjs --env-file <path>
 *   追加: --tables <csv> --num-items <n> --max-pages <n>
 *        --deploy-window-start-ts <epochMs> --deploy-window-end-ts <epochMs>
 *        --draft-created-window-start-ts <epochMs> --draft-created-window-end-ts <epochMs>
 *   --tables の有効値: aiExpenseDraftItems,aiExpenseDrafts,groupDeletionAuditMigrationRecords,printedAmountJoinEvidence,missingPrintedDraftProfile,auditVerify
 *   --deploy-window-*-ts: printedAmountJoinEvidence の明細 createdAt 日付
 *   バケットに使う「候補 deploy job の開始〜終了」境界。
 *   --draft-created-window-*-ts: missingPrintedDraftProfile の draft
 *   createdAt バケットに使う「候補証拠窓」境界（例: snapshot 導入の
 *   候補 deploy job）。いずれも本番導入前後の証明ではなく、実 job 時刻は
 *   CI/deploy ログから人間が供給する。end 省略時は [start,start) の空窓。
 *   全ページ同一リテラルとして埋め込むためページ間の混在は構造的に起きない。
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_NUM_ITEMS = 100;
const DEFAULT_MAX_PAGES = 10000;
const AUDIT_VERIFY_NAME = "auditVerify";

function convexBinPath() {
  const require = createRequire(import.meta.url);
  return resolve(dirname(require.resolve("convex/package.json")), "bin", "main.js");
}

// 集計フィールドの定義。counter 名は convex/deprecatedFieldCounts.ts と揃える。
const ITEM_COUNTERS = [
  "scanned",
  "missingPrintedAmountYen",
  "missingLineType",
  "missingMarkers",
  "emptyMarkers",
  "markersAbsentOrEmptyWithTaxMarker",
  "withTaxMarker",
];

// printedAmountYen 欠落行の分類カウンタ（aiExpenseDraftItems テーブル行のみ。
// 埋め込み snapshot には createdAt/updatedAt が無いので埋め込みには適用しない）。
// 「追加調査候補」は同値証明・backfill 許可ではなく、行レベルの証拠集めの
// 対象切り分けにのみ使う。旧 deploy・ダッシュボード編集・一発 mutation・
// import 等の来歴はこの件数では分からない。
const ITEM_ROW_EXTRA_COUNTERS = [
  "missingPrintedAmountYenWithNormalized",
  "missingPrintedAmountYenWithTaxFields",
  "missingPrintedAmountYenModifiedAfterInsert",
  "missingPrintedAmountYenInvestigationCandidates",
];

const ITEM_TABLE_COUNTERS = [...ITEM_COUNTERS, ...ITEM_ROW_EXTRA_COUNTERS];

const DRAFT_COUNTERS = [
  "scanned",
  "missingReceiptDataContractVersion",
  "withTaxSummaryCorrections",
  "taxSummaryCorrectionsPresent",
  "taxSummaryCorrectionsPresentEmpty",
  "interpretationSourceAi",
  "interpretationSourceLegacyProjection",
  "interpretationAbsent",
  "interpretationMalformed",
  "userOverrideMalformed",
];

// printedAmountYen 欠落行と親 draft の receiptInterpretation 埋め込み items の
// 突合結果カウンタ（convex/deprecatedFieldCounts.printedAmountJoinEvidence と同期）。
// 欠落行は必ず1つの終端バケット（parentDraftMissing/parentDraftGroupMismatch/
// interpretationAbsent/interpretationNonAi/interpretationItemsMalformed/
// siblingsTruncated/rowMissingFromSiblingIndex/ambiguousNameJoinTableSide/
// noNameOverlap/ambiguousNameJoin/uniqueNameJoin* 3種）に入り、
// その合計 === missingPrintedRows。
// hasUserOverride・siblingCountDiffers・createdAt* は終端と併存する副次フラグ、
// uniqueNameJoinPositionConsistent は uniqueNameJoin* 3種に内包される副カウント。
// 一意一致は埋め込み側・兄弟行側の両方で一意な場合のみ。
// 一致系は「値が矛盾しない」程度の整合信号で、backfill 許可・行同一性の証明ではない。
// 日付バケットは「候補 deploy job の窓」に対する位置（本番導入前後の証明ではなく、
// workflow 外の反映経路の有無は分からない）。inWindow = job 開始〜終了の不明領域。
const JOIN_EVIDENCE_COUNTERS = [
  "scanned",
  "missingPrintedRows",
  "createdAtBeforeDeployWindowStart",
  "createdAtInDeployWindow",
  "createdAtAtOrAfterDeployWindowEnd",
  "parentDraftMissing",
  "parentDraftGroupMismatch",
  "hasUserOverride",
  "interpretationAbsent",
  "interpretationNonAi",
  "interpretationItemsMalformed",
  "siblingsTruncated",
  "rowMissingFromSiblingIndex",
  "siblingCountDiffers",
  "ambiguousNameJoinTableSide",
  "noNameOverlap",
  "ambiguousNameJoin",
  "uniqueNameJoinEmbeddedPrintedMissing",
  "uniqueNameJoinPrintedEqualsAmount",
  "uniqueNameJoinPrintedDiffers",
  "uniqueNameJoinPositionConsistent",
];

// missingPrintedDraftProfile: 「printedAmountYen 欠落明細を含む draft」ごとの
// 属性集計（convex/deprecatedFieldCounts.missingPrintedDraftProfile と同期）。
// draft 自体をページ走査するため dedup は構造的に不要・親 ID は出力に含まれない。
// 明細は .take(101) で打ち切り、欠落が確認できない打ち切り draft は
// draftsWithUnconfirmedMissing に分離して属性集計へ進めない。
// 明細は (draft.groupId, draftId) index で読むため、孤児・group 不一致の
// 明細は親から見えず missingPrintedRows とは差が出る（設計通り）。
// draftCreated* バケットは「運用者が供給する候補証拠窓」への位置
// （本番導入前後の証明ではない）。
const PROFILE_COUNTERS = [
  "scanned",
  "draftsWithConfirmedMissingItems",
  "draftItemScanTruncated",
  "draftsWithUnconfirmedMissing",
  "missingPrintedItemsInProfiledDrafts",
  "parentStatusQueued",
  "parentStatusAnalyzing",
  "parentStatusReady",
  "parentStatusNeedsReview",
  "parentStatusFailed",
  "parentStatusRegistered",
  "parentStatusUnrecognized",
  "parentDocumentTypeReceipt",
  "parentDocumentTypeConveniencePayment",
  "parentDocumentTypeUnknown",
  "parentDocumentTypeUnrecognized",
  "parentSourceTypeImageUpload",
  "parentSourceTypeUnrecognized",
  "parentCreatedByUserIdPresent",
  "parentImageFileNamePresent",
  "parentReceiptDataContractVersionPresent",
  "parentRegisteredReceiptIdPresent",
  "parentReviewReasonsNonEmpty",
  "parentWarningsNonEmpty",
  "parentReceiptUserOverridePresent",
  "parentInterpretationAbsent",
  "parentInterpretationSourceAi",
  "parentInterpretationSourceLegacyProjection",
  "parentInterpretationSourceUnrecognized",
  "draftCreatedBeforeWindowStart",
  "draftCreatedInWindow",
  "draftCreatedAtOrAfterWindowEnd",
];

const RECORD_COUNTERS = ["scanned", "migrated", "skipped", "failed"];

const VERIFY_COUNTERS = ["remainingOrphaned", "unmigrated", "skipped"];

const ITEM_FIELD_COUNT_JS = `
out.scanned += 1;
if (item.printedAmountYen === undefined) out.missingPrintedAmountYen += 1;
if (item.lineType === undefined) out.missingLineType += 1;
const me = item.markers !== undefined && item.markers.length === 0;
if (item.markers === undefined) out.missingMarkers += 1;
if (me) out.emptyMarkers += 1;
const h = item.taxMarker !== undefined && item.taxMarker !== "";
if ((item.markers === undefined || me) && h) out.markersAbsentOrEmptyWithTaxMarker += 1;
if (h) out.withTaxMarker += 1;`;

// aiExpenseDraftItems テーブル行限定の分類。埋め込み snapshot には適用しない
// （createdAt/updatedAt が無く modifiedAfterInsert が判定不能なため）。
const ITEM_ROW_PRINTED_CLASSIFY_JS = `
if (item.printedAmountYen === undefined) {
  const hn = item.normalizedAmountYen !== undefined;
  const ht = item.amountBasis !== undefined
    || item.taxRatePercent !== undefined
    || item.allocatedTaxYen !== undefined
    || item.taxAllocationStatus !== undefined
    || item.taxResolutionStatus !== undefined
    || item.taxResolutionSource !== undefined
    || (item.taxReviewReasons !== undefined && item.taxReviewReasons.length > 0)
    || (item.taxConfirmedFields !== undefined && item.taxConfirmedFields.length > 0)
    || (item.taxMarker !== undefined && item.taxMarker !== "");
  const md = item.updatedAt !== item.createdAt;
  if (hn) out.missingPrintedAmountYenWithNormalized += 1;
  if (ht) out.missingPrintedAmountYenWithTaxFields += 1;
  if (md) out.missingPrintedAmountYenModifiedAfterInsert += 1;
  if (!hn && !ht && !md) out.missingPrintedAmountYenInvestigationCandidates += 1;
}`;

const ZERO_ITEM = `{${ITEM_COUNTERS.map((k) => `${k}:0`).join(",")}}`;
const ZERO_ITEM_TABLE = `{${ITEM_TABLE_COUNTERS.map((k) => `${k}:0`).join(",")}}`;

// 各テーブルの1ページ分 inline query ソースを組み立てる。
// cursor は JSON.stringify 済みリテラル（初回は "null"）。
function itemsPageJs(cursorLiteral, numItems) {
  return `const out = ${ZERO_ITEM_TABLE}; const r = await ctx.db.query("aiExpenseDraftItems").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const item of r.page) { ${ITEM_FIELD_COUNT_JS} ${ITEM_ROW_PRINTED_CLASSIFY_JS} } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

function draftsPageJs(cursorLiteral, numItems) {
  // values.items が配列でない保存形状は items 0件と見なさず、malformed カウンタで可視化する
  return `const out = {scanned:0, missingReceiptDataContractVersion:0, withTaxSummaryCorrections:0, taxSummaryCorrectionsPresent:0, taxSummaryCorrectionsPresentEmpty:0, interpretationSourceAi:0, interpretationSourceLegacyProjection:0, interpretationAbsent:0, interpretationMalformed:0, userOverrideMalformed:0, interpretation:${ZERO_ITEM}, userOverride:${ZERO_ITEM}}; const count = (item, c) => { const out = c; ${ITEM_FIELD_COUNT_JS} }; const nested = (v, c, key) => { if (v === undefined) return; const items = v?.values?.items; if (!Array.isArray(items)) { out[key] += 1; return; } for (const item of items) count(item, c); }; const r = await ctx.db.query("aiExpenseDrafts").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const d of r.page) { out.scanned += 1; if (d.receiptDataContractVersion === undefined) out.missingReceiptDataContractVersion += 1; const corr = d.receiptUserOverride?.taxSummaryCorrections; if (corr !== undefined && corr.length > 0) out.withTaxSummaryCorrections += 1; if (corr !== undefined) { out.taxSummaryCorrectionsPresent += 1; if (corr.length === 0) out.taxSummaryCorrectionsPresentEmpty += 1; } const src = d.receiptInterpretation?.source; if (src === "ai") out.interpretationSourceAi += 1; else if (src === "legacy_projection") out.interpretationSourceLegacyProjection += 1; else out.interpretationAbsent += 1; nested(d.receiptInterpretation, out.interpretation, "interpretationMalformed"); nested(d.receiptUserOverride, out.userOverride, "userOverrideMalformed"); } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

// printedAmountJoinEvidence の inline 版。siblings は .take(101) で打ち切り、
// 上限到達（101件）は完全列挙不能として siblingsTruncated で打ち止める
// （位置・件数比較が信頼できないため join には進まない）。一意一致は
// 埋め込み側・兄弟行側の両方で一意な場合のみ。items 非配列・itemName 非文字列・
// 親 draft の group 不一致は「不明」として join しない。
// startLiteral/endLiteral は JSON.stringify 済み（省略時は "undefined"）。
// 同一スキャン内では全ページに同じリテラルを埋め込むので窓境界は混在しない。
// endLiteral 省略時は [start, start) の空窓（inWindow=0・start 以降は全て
// atOrAfterEnd）になり、module 側と同じ意味になる。
function joinEvidencePageJs(cursorLiteral, numItems, startLiteral, endLiteral) {
  return `const out = {${JOIN_EVIDENCE_COUNTERS.map((k) => `${k}:0`).join(",")}}; const r = await ctx.db.query("aiExpenseDraftItems").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); const ws = ${startLiteral}; const we = ${endLiteral}; const wEnd = we === undefined ? ws : we; for (const item of r.page) { out.scanned += 1; if (item.printedAmountYen !== undefined) continue; out.missingPrintedRows += 1; if (ws !== undefined) { if (item.createdAt < ws) out.createdAtBeforeDeployWindowStart += 1; else if (item.createdAt < wEnd) out.createdAtInDeployWindow += 1; else out.createdAtAtOrAfterDeployWindowEnd += 1; } const draft = await ctx.db.get(item.draftId); if (draft === null) { out.parentDraftMissing += 1; continue; } if (draft.groupId !== item.groupId) { out.parentDraftGroupMismatch += 1; continue; } if (draft.receiptUserOverride !== undefined) out.hasUserOverride += 1; const interp = draft.receiptInterpretation; if (interp === undefined) { out.interpretationAbsent += 1; continue; } if (interp.source !== "ai") { out.interpretationNonAi += 1; continue; } const er = interp.values?.items; if (!Array.isArray(er) || er.some(e => typeof e !== "object" || e === null || typeof e.itemName !== "string")) { out.interpretationItemsMalformed += 1; continue; } const siblings = await ctx.db.query("aiExpenseDraftItems").withIndex("by_group_id_and_draft_id", q => q.eq("groupId", item.groupId).eq("draftId", item.draftId)).take(101); if (siblings.length >= 101) { out.siblingsTruncated += 1; continue; } const rowIndex = siblings.findIndex(s => s._id === item._id); if (rowIndex === -1) { out.rowMissingFromSiblingIndex += 1; continue; } const embedded = er; if (embedded.length !== siblings.length) out.siblingCountDiffers += 1; if (siblings.filter(s => s.itemName === item.itemName).length > 1) { out.ambiguousNameJoinTableSide += 1; continue; } const matches = embedded.map((e, i) => ({e, i})).filter(({e}) => e.itemName === item.itemName); if (matches.length === 0) { out.noNameOverlap += 1; continue; } if (matches.length > 1) { out.ambiguousNameJoin += 1; continue; } const {e, i} = matches[0]; if (i === rowIndex) out.uniqueNameJoinPositionConsistent += 1; if (e.printedAmountYen === undefined) out.uniqueNameJoinEmbeddedPrintedMissing += 1; else if (e.printedAmountYen === item.amountYen) out.uniqueNameJoinPrintedEqualsAmount += 1; else out.uniqueNameJoinPrintedDiffers += 1; } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

// missingPrintedDraftProfile の inline 版（module query と同じ判定）。
// startLiteral/endLiteral は draftCreatedWindow の境界（JSON.stringify 済み・
// 省略時 "undefined"）。全ページ同一リテラルなので窓境界は混在しない。
function profilePageJs(cursorLiteral, numItems, startLiteral, endLiteral) {
  return `const out = {${PROFILE_COUNTERS.map((k) => `${k}:0`).join(",")}}; const ws = ${startLiteral}; const we = ${endLiteral}; const wEnd = we === undefined ? ws : we; const r = await ctx.db.query("aiExpenseDrafts").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const d of r.page) { out.scanned += 1; const items = await ctx.db.query("aiExpenseDraftItems").withIndex("by_group_id_and_draft_id", q => q.eq("groupId", d.groupId).eq("draftId", d._id)).take(101); const tr = items.length >= 101; if (tr) out.draftItemScanTruncated += 1; const mc = items.reduce((a, i) => a + (i.printedAmountYen === undefined ? 1 : 0), 0); if (mc === 0) { if (tr) out.draftsWithUnconfirmedMissing += 1; continue; } out.draftsWithConfirmedMissingItems += 1; out.missingPrintedItemsInProfiledDrafts += mc; switch (d.status) { case "queued": out.parentStatusQueued += 1; break; case "analyzing": out.parentStatusAnalyzing += 1; break; case "ready": out.parentStatusReady += 1; break; case "needs_review": out.parentStatusNeedsReview += 1; break; case "failed": out.parentStatusFailed += 1; break; case "registered": out.parentStatusRegistered += 1; break; default: out.parentStatusUnrecognized += 1; } switch (d.documentType) { case "receipt": out.parentDocumentTypeReceipt += 1; break; case "convenience_payment": out.parentDocumentTypeConveniencePayment += 1; break; case "unknown": out.parentDocumentTypeUnknown += 1; break; default: out.parentDocumentTypeUnrecognized += 1; } if (d.sourceType === "image_upload") out.parentSourceTypeImageUpload += 1; else out.parentSourceTypeUnrecognized += 1; if (d.createdByUserId !== undefined) out.parentCreatedByUserIdPresent += 1; if (d.imageFileName !== undefined) out.parentImageFileNamePresent += 1; if (d.receiptDataContractVersion !== undefined) out.parentReceiptDataContractVersionPresent += 1; if (d.registeredReceiptId !== undefined) out.parentRegisteredReceiptIdPresent += 1; if (Array.isArray(d.reviewReasons) && d.reviewReasons.length > 0) out.parentReviewReasonsNonEmpty += 1; if (Array.isArray(d.warnings) && d.warnings.length > 0) out.parentWarningsNonEmpty += 1; if (d.receiptUserOverride !== undefined) out.parentReceiptUserOverridePresent += 1; const isrc = d.receiptInterpretation?.source; if (d.receiptInterpretation === undefined) out.parentInterpretationAbsent += 1; else if (isrc === "ai") out.parentInterpretationSourceAi += 1; else if (isrc === "legacy_projection") out.parentInterpretationSourceLegacyProjection += 1; else out.parentInterpretationSourceUnrecognized += 1; if (ws !== undefined && typeof d.createdAt === "number") { if (d.createdAt < ws) out.draftCreatedBeforeWindowStart += 1; else if (d.createdAt < wEnd) out.draftCreatedInWindow += 1; else out.draftCreatedAtOrAfterWindowEnd += 1; } } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

function recordsPageJs(cursorLiteral, numItems) {
  return `const out = {scanned:0, migrated:0, skipped:0, failed:0}; const r = await ctx.db.query("groupDeletionAuditMigrationRecords").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const rec of r.page) { out.scanned += 1; if (rec.status === "migrated") out.migrated += 1; else if (rec.status === "skipped") out.skipped += 1; else if (rec.status === "failed") out.failed += 1; } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

export const TABLE_SPECS = {
  aiExpenseDraftItems: { counters: ITEM_TABLE_COUNTERS, pageJs: itemsPageJs },
  aiExpenseDrafts: {
    counters: DRAFT_COUNTERS,
    nested: { interpretation: ITEM_COUNTERS, userOverride: ITEM_COUNTERS },
    pageJs: draftsPageJs,
  },
  groupDeletionAuditMigrationRecords: {
    counters: RECORD_COUNTERS,
    pageJs: recordsPageJs,
  },
  printedAmountJoinEvidence: {
    counters: JOIN_EVIDENCE_COUNTERS,
    pageJs: joinEvidencePageJs,
  },
  missingPrintedDraftProfile: {
    counters: PROFILE_COUNTERS,
    pageJs: profilePageJs,
  },
};

function defaultExec(args) {
  const result = spawnSync(process.execPath, [convexBinPath(), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

export function parseJsonResult(stdout) {
  const text = String(stdout ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("convex run の出力から JSON オブジェクトを取得できません（stdout を秘匿）");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function assertNumberCounts(obj, counterKeys, label) {
  for (const key of counterKeys) {
    const value = obj?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${label} の ${key} が非負の数値ではありません: ${JSON.stringify(value)}`);
    }
  }
}

export function validatePage(spec, result) {
  if (typeof result !== "object" || result === null) {
    throw new Error("ページ結果がオブジェクトではありません");
  }
  if (typeof result.isDone !== "boolean") {
    throw new Error("isDone が boolean ではありません");
  }
  if (result.continueCursor !== null && typeof result.continueCursor !== "string") {
    throw new Error("continueCursor が string|null ではありません");
  }
  if (!result.isDone && typeof result.continueCursor !== "string") {
    throw new Error("未完ページで continueCursor が文字列ではありません");
  }
  const page = result.page ?? result;
  assertNumberCounts(page, spec.counters, "page");
  if (spec.nested) {
    for (const [name, keys] of Object.entries(spec.nested)) {
      assertNumberCounts(page[name], keys, `page.${name}`);
    }
  }
  return page;
}

function mergeCounts(spec, totals, page) {
  for (const key of spec.counters) totals[key] += page[key];
  if (spec.nested) {
    for (const [name, keys] of Object.entries(spec.nested)) {
      for (const key of keys) totals[name][key] += page[name][key];
    }
  }
}

function emptyTotals(spec) {
  const totals = Object.fromEntries(spec.counters.map((key) => [key, 0]));
  if (spec.nested) {
    for (const [name, keys] of Object.entries(spec.nested)) {
      totals[name] = Object.fromEntries(keys.map((key) => [key, 0]));
    }
  }
  return totals;
}

function runCli(exec, args, label) {
  const result = exec(args);
  if (result.status !== 0) {
    // stderr には cursor・deployment 名・環境値が含まれうるため内容は出さない
    throw new Error(`${label} の呼び出しが失敗しました（exit ${result.status}、stderr は秘匿）`);
  }
  return parseJsonResult(result.stdout);
}

export function scanTable(
  spec,
  { targetArgs, numItems, maxPages, windowStartTs, windowEndTs, exec = defaultExec },
) {
  const totals = emptyTotals(spec);
  const seenCursors = new Set();
  let cursor = null;
  let pages = 0;
  // 窓境界は全ページで同一リテラルを埋め込む（ページごとに値が変わらない
  // ことを構造で保証する。module query 側は carry に束縛して拒否）。
  const startLiteral = windowStartTs === undefined ? "undefined" : JSON.stringify(windowStartTs);
  const endLiteral = windowEndTs === undefined ? "undefined" : JSON.stringify(windowEndTs);
  for (;;) {
    if (pages >= maxPages) {
      throw new Error(`ページ上限 ${maxPages} を超過しました（走査を中止）`);
    }
    const result = runCli(
      exec,
      [
        "run",
        ...targetArgs,
        "--inline-query",
        spec.pageJs(JSON.stringify(cursor), numItems, startLiteral, endLiteral),
      ],
      "inline query",
    );
    const page = validatePage(spec, result);
    mergeCounts(spec, totals, page);
    pages += 1;
    if (result.isDone) return { totals, pages };
    if (seenCursors.has(result.continueCursor)) {
      throw new Error("continueCursor が循環しました（走査を中止）");
    }
    seenCursors.add(result.continueCursor);
    cursor = result.continueCursor;
  }
}

export function scanVerify({ targetArgs, maxPages, exec = defaultExec }) {
  const spec = { counters: VERIFY_COUNTERS };
  const totals = emptyTotals(spec);
  const seenCursors = new Set();
  let cursor;
  let pages = 0;
  for (;;) {
    if (pages >= maxPages) {
      throw new Error(`ページ上限 ${maxPages} を超過しました（走査を中止）`);
    }
    const argsJson = cursor === undefined ? "{}" : JSON.stringify({ cursor });
    const result = runCli(
      exec,
      ["run", ...targetArgs, "legacyGroupDeletionAuditMigration:verify", argsJson],
      "audit verify",
    );
    const page = validatePage(spec, result);
    mergeCounts(spec, totals, page);
    pages += 1;
    if (result.isDone) return { totals, pages };
    if (seenCursors.has(result.continueCursor)) {
      throw new Error("continueCursor が循環しました（走査を中止）");
    }
    seenCursors.add(result.continueCursor);
    cursor = result.continueCursor;
  }
}

export function parseCliArgs(argv) {
  const opts = { numItems: DEFAULT_NUM_ITEMS, maxPages: DEFAULT_MAX_PAGES };
  const targetArgs = [];
  let targetCount = 0;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--prod" || arg === "--dev") {
      targetCount += 1;
      if (arg === "--prod") targetArgs.push("--prod");
    } else if (arg === "--deployment" || arg === "--env-file") {
      targetCount += 1;
      const value = argv[++i];
      if (!value) throw new Error(`${arg} に値が必要です`);
      targetArgs.push(arg, value);
    } else if (arg === "--num-items") {
      opts.numItems = Number(argv[++i]);
      if (!Number.isInteger(opts.numItems) || opts.numItems <= 0) {
        throw new Error("--num-items は正の整数が必要です");
      }
    } else if (arg === "--max-pages") {
      opts.maxPages = Number(argv[++i]);
      if (!Number.isInteger(opts.maxPages) || opts.maxPages <= 0) {
        throw new Error("--max-pages は正の整数が必要です");
      }
    } else if (arg === "--deploy-window-start-ts") {
      opts.deployWindowStartTs = Number(argv[++i]);
      if (!Number.isFinite(opts.deployWindowStartTs)) {
        throw new Error("--deploy-window-start-ts は数値（epoch ms）が必要です");
      }
    } else if (arg === "--deploy-window-end-ts") {
      opts.deployWindowEndTs = Number(argv[++i]);
      if (!Number.isFinite(opts.deployWindowEndTs)) {
        throw new Error("--deploy-window-end-ts は数値（epoch ms）が必要です");
      }
    } else if (arg === "--draft-created-window-start-ts") {
      opts.draftCreatedWindowStartTs = Number(argv[++i]);
      if (!Number.isFinite(opts.draftCreatedWindowStartTs)) {
        throw new Error("--draft-created-window-start-ts は数値（epoch ms）が必要です");
      }
    } else if (arg === "--draft-created-window-end-ts") {
      opts.draftCreatedWindowEndTs = Number(argv[++i]);
      if (!Number.isFinite(opts.draftCreatedWindowEndTs)) {
        throw new Error("--draft-created-window-end-ts は数値（epoch ms）が必要です");
      }
    } else if (arg === "--tables") {
      opts.tables = String(argv[++i] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      throw new Error(`不明な引数: ${arg}`);
    }
  }
  if (targetCount === 0) {
    throw new Error(
      "対象 deployment の指定がありません。--prod / --deployment <ref> / --env-file <path> / --dev のいずれかを明示してください",
    );
  }
  if (targetCount > 1) {
    throw new Error(
      "対象指定は --prod / --deployment / --env-file / --dev のうち1つだけにしてください",
    );
  }
  if (opts.deployWindowEndTs !== undefined) {
    if (
      opts.deployWindowStartTs === undefined ||
      opts.deployWindowEndTs < opts.deployWindowStartTs
    ) {
      throw new Error(
        "--deploy-window-end-ts は --deploy-window-start-ts と同時に、それ以降の値で指定してください",
      );
    }
  }
  if (opts.draftCreatedWindowEndTs !== undefined) {
    if (
      opts.draftCreatedWindowStartTs === undefined ||
      opts.draftCreatedWindowEndTs < opts.draftCreatedWindowStartTs
    ) {
      throw new Error(
        "--draft-created-window-end-ts は --draft-created-window-start-ts と同時に、それ以降の値で指定してください",
      );
    }
  }
  if (opts.tables) {
    for (const table of opts.tables) {
      if (table !== AUDIT_VERIFY_NAME && !TABLE_SPECS[table]) {
        throw new Error(
          `不明なテーブル: ${table}（有効値: ${[...Object.keys(TABLE_SPECS), AUDIT_VERIFY_NAME].join(", ")}）`,
        );
      }
    }
  }
  return { opts, targetArgs };
}

async function main() {
  const { opts, targetArgs } = parseCliArgs(process.argv.slice(2));
  const tables = opts.tables ?? [...Object.keys(TABLE_SPECS), AUDIT_VERIFY_NAME];
  const output = {};
  for (const table of tables) {
    if (table === AUDIT_VERIFY_NAME) continue;
    process.stderr.write(`[count] ${table} を走査中...\n`);
    // 窓の意味は spec ごとに異なる: join evidence は明細 createdAt に対する
    // 候補 deploy job 窓、profile は draft createdAt に対する候補証拠窓。
    const window =
      table === "missingPrintedDraftProfile"
        ? {
            windowStartTs: opts.draftCreatedWindowStartTs,
            windowEndTs: opts.draftCreatedWindowEndTs,
          }
        : { windowStartTs: opts.deployWindowStartTs, windowEndTs: opts.deployWindowEndTs };
    output[table] = scanTable(TABLE_SPECS[table], {
      targetArgs,
      numItems: opts.numItems,
      maxPages: opts.maxPages,
      ...window,
    });
  }
  if (tables.includes(AUDIT_VERIFY_NAME)) {
    process.stderr.write("[count] legacyGroupDeletionAuditMigration:verify を実行中...\n");
    output[AUDIT_VERIFY_NAME] = scanVerify({ targetArgs, maxPages: opts.maxPages });
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`[count] エラー: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
