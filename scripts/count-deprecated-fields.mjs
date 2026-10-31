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
 *   --tables の有効値: aiExpenseDraftItems,aiExpenseDrafts,groupDeletionAuditMigrationRecords,auditVerify
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

const DRAFT_COUNTERS = [
  "scanned",
  "missingReceiptDataContractVersion",
  "withTaxSummaryCorrections",
  "interpretationMalformed",
  "userOverrideMalformed",
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

const ZERO_ITEM = `{${ITEM_COUNTERS.map((k) => `${k}:0`).join(",")}}`;

// 各テーブルの1ページ分 inline query ソースを組み立てる。
// cursor は JSON.stringify 済みリテラル（初回は "null"）。
function itemsPageJs(cursorLiteral, numItems) {
  return `const out = ${ZERO_ITEM}; const r = await ctx.db.query("aiExpenseDraftItems").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const item of r.page) { ${ITEM_FIELD_COUNT_JS} } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

function draftsPageJs(cursorLiteral, numItems) {
  // values.items が配列でない保存形状は items 0件と見なさず、malformed カウンタで可視化する
  return `const out = {scanned:0, missingReceiptDataContractVersion:0, withTaxSummaryCorrections:0, interpretationMalformed:0, userOverrideMalformed:0, interpretation:${ZERO_ITEM}, userOverride:${ZERO_ITEM}}; const count = (item, c) => { const out = c; ${ITEM_FIELD_COUNT_JS} }; const nested = (v, c, key) => { if (v === undefined) return; const items = v?.values?.items; if (!Array.isArray(items)) { out[key] += 1; return; } for (const item of items) count(item, c); }; const r = await ctx.db.query("aiExpenseDrafts").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const d of r.page) { out.scanned += 1; if (d.receiptDataContractVersion === undefined) out.missingReceiptDataContractVersion += 1; const corr = d.receiptUserOverride?.taxSummaryCorrections; if (corr !== undefined && corr.length > 0) out.withTaxSummaryCorrections += 1; nested(d.receiptInterpretation, out.interpretation, "interpretationMalformed"); nested(d.receiptUserOverride, out.userOverride, "userOverrideMalformed"); } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

function recordsPageJs(cursorLiteral, numItems) {
  return `const out = {scanned:0, migrated:0, skipped:0, failed:0}; const r = await ctx.db.query("groupDeletionAuditMigrationRecords").paginate({cursor: ${cursorLiteral}, numItems: ${numItems}}); for (const rec of r.page) { out.scanned += 1; if (rec.status === "migrated") out.migrated += 1; else if (rec.status === "skipped") out.skipped += 1; else if (rec.status === "failed") out.failed += 1; } return {page: out, isDone: r.isDone, continueCursor: r.continueCursor};`;
}

export const TABLE_SPECS = {
  aiExpenseDraftItems: { counters: ITEM_COUNTERS, pageJs: itemsPageJs },
  aiExpenseDrafts: {
    counters: DRAFT_COUNTERS,
    nested: { interpretation: ITEM_COUNTERS, userOverride: ITEM_COUNTERS },
    pageJs: draftsPageJs,
  },
  groupDeletionAuditMigrationRecords: {
    counters: RECORD_COUNTERS,
    pageJs: recordsPageJs,
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

export function scanTable(spec, { targetArgs, numItems, maxPages, exec = defaultExec }) {
  const totals = emptyTotals(spec);
  const seenCursors = new Set();
  let cursor = null;
  let pages = 0;
  for (;;) {
    if (pages >= maxPages) {
      throw new Error(`ページ上限 ${maxPages} を超過しました（走査を中止）`);
    }
    const result = runCli(
      exec,
      ["run", ...targetArgs, "--inline-query", spec.pageJs(JSON.stringify(cursor), numItems)],
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
    output[table] = scanTable(TABLE_SPECS[table], {
      targetArgs,
      numItems: opts.numItems,
      maxPages: opts.maxPages,
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
