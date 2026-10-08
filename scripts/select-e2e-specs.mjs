#!/usr/bin/env node
/**
 * 変更ファイルからローカルpush前検証で実行すべきE2E specを選定する。
 *
 * 使い方:
 *   node scripts/select-e2e-specs.mjs --base <sha> --head <sha> [--include <spec> ...]
 *
 * 出力（stdout, JSON）:
 *   { runtimeRelevant, reason, specs, unmapped, fallback }
 *   - specs: 実行するspecファイル（repo相対パス、重複なし、ソート済み）
 *   - unmapped: spec-mapのどのglobにも一致しなかったruntime-relevantファイル
 *   - fallback: unmappedが存在して安全側全件になった場合true
 *
 * 選定ルール（Issue #957）:
 *   - classify-e2e-relevanceが runtime_relevant: false なら specs は
 *     --include で指定されたものだけ
 *   - trueなら spec-map.json のglobヒット ∪ @smokeタグ付きspec（CI authenticatedと
 *     同じ最低ライン）。変更された e2e/*.spec.ts は自身を選定に含める
 *   - mapに無いパスが1つでもあれば @smoke ∪ @public 全件へ安全側fallbackし、
 *     該当ファイル名を unmapped に列挙する（map追記を促すため）
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyChangedFiles,
  isMetadataOnlyPath,
  isProcessOnlyPath,
  normalizeChangedPath,
  readChangedFiles,
} from "./classify-e2e-relevance.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_MAP_PATH = path.join(repoRoot, "e2e", "spec-map.json");
const E2E_SPEC_PATTERN = /^e2e\/[^/]+\.spec\.ts$/;

/** 行内で文字列リテラル外の `//` 以降を削る。タイトル内の "a // b" 等を壊さない。 */
function stripLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/** specファイルに付けられた実行タグ（@smoke / @public）を拾う。コメント内の言及は拾わない。 */
function specTags(body) {
  // コメント（//行・/*ブロック*/）を除去してからタグを探す
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(stripLineComment)
    .join("\n");
  const tags = new Set();
  for (const match of code.matchAll(/@(smoke|public)\b/g)) tags.add(match[1]);
  return tags;
}

export function loadSpecMap(mapPath = SPEC_MAP_PATH) {
  return JSON.parse(readFileSync(mapPath, "utf8"));
}

export function listSpecFiles(e2eDir = path.join(repoRoot, "e2e")) {
  return readdirSync(e2eDir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => `e2e/${name}`)
    .sort();
}

export function specsByTag(tag, { specFiles = listSpecFiles(), cwd = repoRoot } = {}) {
  return specFiles.filter((spec) => {
    const body = readFileSync(path.join(cwd, spec), "utf8");
    return specTags(body).has(tag);
  });
}

/** gitignore風glob（*は1セグメント内、**は0個以上のセグメント、?は1文字）。 */
export function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        out += "(?:[^/]+/)*";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** spec-mapの値にあるspec名globを既存specへ展開する。 */
function expandSpecPatterns(patterns, specFiles) {
  const specs = new Set();
  for (const pattern of patterns) {
    if (pattern.includes("*") || pattern.includes("?")) {
      const re = globToRegExp(pattern);
      for (const spec of specFiles) if (re.test(spec)) specs.add(spec);
    } else {
      specs.add(pattern);
    }
  }
  return specs;
}

/** spec-mapの検査にも使えるように、match結果を分離して返す。 */
export function mapChangedFiles(changedFiles, map, specFiles) {
  const specs = new Set();
  const unmapped = [];
  const patterns = Object.keys(map).filter((key) => !key.startsWith("$"));
  const compiled = patterns.map((pattern) => [globToRegExp(pattern), pattern]);
  for (const file of changedFiles) {
    const normalized = normalizeChangedPath(file);
    if (E2E_SPEC_PATTERN.test(normalized)) {
      specs.add(normalized); // spec自身の変更はそのspecを実行する
      continue;
    }
    let matched = false;
    for (const [re, pattern] of compiled) {
      if (re.test(normalized)) {
        matched = true;
        for (const spec of expandSpecPatterns(map[pattern], specFiles)) specs.add(spec);
      }
    }
    if (!matched && !isMetadataOnlyPath(normalized) && !isProcessOnlyPath(normalized)) {
      unmapped.push(normalized);
    }
  }
  return { specs, unmapped };
}

export function selectSpecs({
  changedFiles,
  includeSpecs = [],
  cwd = repoRoot,
  specFiles = listSpecFiles(path.join(cwd, "e2e")),
  map = loadSpecMap(path.join(cwd, "e2e", "spec-map.json")),
} = {}) {
  const classification = classifyChangedFiles(changedFiles);
  const includes = includeSpecs.map(normalizeChangedPath);
  // 削除済みspec・map内の陳腐なリテラル名は実行対象から外す
  const existing = new Set([...specFiles, ...includes]);
  const existingOnly = (names) => [...names].filter((spec) => existing.has(spec));
  if (!classification.runtimeRelevant) {
    return {
      runtimeRelevant: false,
      reason: classification.reason,
      specs: [...new Set(includes)].sort(),
      unmapped: [],
      fallback: false,
    };
  }
  const smoke = specsByTag("smoke", { specFiles, cwd });
  const { specs, unmapped } = mapChangedFiles(changedFiles, map, specFiles);
  const selected = new Set(existingOnly([...specs, ...smoke, ...includes]));
  let fallback = false;
  if (unmapped.length > 0) {
    fallback = true;
    for (const spec of specsByTag("public", { specFiles, cwd })) selected.add(spec);
  }
  return {
    runtimeRelevant: true,
    reason: classification.reason,
    specs: [...selected].sort(),
    unmapped: unmapped.sort(),
    fallback,
  };
}

export function parseArguments(argv) {
  const result = { base: null, head: null, includeSpecs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") {
      result.base = argv[++i];
    } else if (arg === "--head") {
      result.head = argv[++i];
    } else if (arg === "--include") {
      result.includeSpecs.push(argv[++i]);
    } else {
      throw new Error(`不明な引数: ${arg}`);
    }
  }
  if (!result.base || !result.head) {
    throw new Error("--base と --head を指定してください");
  }
  return result;
}

function main() {
  const { base, head, includeSpecs } = parseArguments(process.argv.slice(2));
  const changedFiles = readChangedFiles({ baseSha: base, headSha: head, cwd: repoRoot });
  const result = selectSpecs({ changedFiles, includeSpecs });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export const SPEC_MAP_FILENAME = "e2e/spec-map.json";
export function specMapEntryExists(map, spec, { cwd = repoRoot } = {}) {
  return existsSync(path.join(cwd, spec));
}
