import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeChangedPath } from "./classify-e2e-relevance.mjs";
import { globToRegExp } from "./select-e2e-specs.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const UNIT_RELATED_MAP_PATH = "scripts/unit-related-map.json";

/**
 * unit関連mapを読む。テストがimportせずfsで読むrepo内ファイルを、それを検査する
 * テストへ対応づける。無ければ空map（mapは任意の追加知識）。
 * required: true のときはmap不在をエラーにする。CI scopeのようにmap欠落で
 * 文書依存テストの実行が抜けることを許せない呼び出し側向け。
 * 値が文字列配列でない壊れたmapは常にエラー（文字列を反復してテストを
 * 静かに取りこぼすのを防ぐ）。
 */
export function loadUnitRelatedMap(cwd = repoRoot, { required = false } = {}) {
  const mapPath = path.join(cwd, UNIT_RELATED_MAP_PATH);
  if (!existsSync(mapPath)) {
    if (required) throw new Error(`${UNIT_RELATED_MAP_PATH} not found`);
    return {};
  }
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new Error(`${UNIT_RELATED_MAP_PATH} must be a JSON object`);
  }
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith("$")) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`${UNIT_RELATED_MAP_PATH}: "${key}" must be an array of strings`);
    }
  }
  return map;
}

/**
 * unit関連mapに当たる変更ファイルから、importグラフに乗らない依存テストを引く。
 * .md/.json等 unitRelatedTargets から外れる変更でもmapヒットすれば対象にする。
 */
export function unitMappedTests(changedFiles, map) {
  const tests = new Set();
  const compiled = Object.keys(map)
    .filter((key) => !key.startsWith("$"))
    .map((pattern) => [globToRegExp(pattern), pattern]);
  for (const file of changedFiles) {
    const normalized = normalizeChangedPath(file);
    for (const [re, pattern] of compiled) {
      if (re.test(normalized)) {
        for (const test of map[pattern]) tests.add(test);
      }
    }
  }
  return [...tests].sort();
}
