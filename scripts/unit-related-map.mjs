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
 */
export function loadUnitRelatedMap(cwd = repoRoot, { required = false } = {}) {
  const mapPath = path.join(cwd, UNIT_RELATED_MAP_PATH);
  if (!existsSync(mapPath)) {
    if (required) throw new Error(`${UNIT_RELATED_MAP_PATH} not found`);
    return {};
  }
  return JSON.parse(readFileSync(mapPath, "utf8"));
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
