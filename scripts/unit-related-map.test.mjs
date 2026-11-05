import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadUnitRelatedMap, UNIT_RELATED_MAP_PATH, unitMappedTests } from "./unit-related-map.mjs";

const dirs = [];

function tmpdirFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "unit-map-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("loadUnitRelatedMap", () => {
  test("mapが無ければ空mapを返す", () => {
    expect(loadUnitRelatedMap(tmpdirFixture())).toEqual({});
  });

  test("required: true ならmap不在でエラー", () => {
    expect(() => loadUnitRelatedMap(tmpdirFixture(), { required: true })).toThrow(
      UNIT_RELATED_MAP_PATH,
    );
  });

  test("mapをJSONとして読む", () => {
    const dir = tmpdirFixture();
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    writeFileSync(
      path.join(dir, UNIT_RELATED_MAP_PATH),
      JSON.stringify({ "docs/*.md": ["x.test.ts"] }),
    );
    expect(loadUnitRelatedMap(dir)).toEqual({ "docs/*.md": ["x.test.ts"] });
  });
});

describe("unitMappedTests", () => {
  const map = {
    $comment: "map説明は対象外",
    "docs/line/*.png": ["lib/a.test.ts", "convex/b.test.ts"],
    "assets/**": ["lib/a.test.ts"],
  };
  test("globに当たる変更ファイルから対応テストを引く（$キー無視・重複排除・ソート）", () => {
    expect(unitMappedTests(["docs/line/menu.png", "assets/x.png"], map)).toEqual([
      "convex/b.test.ts",
      "lib/a.test.ts",
    ]);
  });
  test("当たらない変更は空", () => {
    expect(unitMappedTests(["src/app.ts"], map)).toEqual([]);
  });
});
