import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  globToRegExp,
  listSpecFiles,
  loadSpecMap,
  mapChangedFiles,
  parseArguments,
  selectSpecs,
  specsByTag,
} from "./select-e2e-specs.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dirs = [];

function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "select-e2e-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "e2e"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(dir, "e2e", name), body);
  }
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("globToRegExp", () => {
  test("** matches zero or more segments", () => {
    const re = globToRegExp("src/features/**");
    expect(re.test("src/features/x.ts")).toBe(true);
    expect(re.test("src/features/a/b/c.ts")).toBe(true);
    expect(re.test("src/features")).toBe(false);
    expect(re.test("src/featuresx/y.ts")).toBe(false);
  });
  test("* matches within one segment", () => {
    const re = globToRegExp("e2e/ai-expense-queue*.spec.ts");
    expect(re.test("e2e/ai-expense-queue.spec.ts")).toBe(true);
    expect(re.test("e2e/ai-expense-queue.tax-regression.spec.ts")).toBe(true);
    expect(re.test("e2e/other/ai-expense-queue.spec.ts")).toBe(false);
  });
});

describe("spec-map fixtures", () => {
  test("loadSpecMap + listSpecFiles read the real repo", () => {
    const map = loadSpecMap();
    expect(map["src/features/expense-search/**"]).toContain("e2e/expense-search.spec.ts");
    const specs = listSpecFiles();
    expect(specs).toContain("e2e/expense-search.spec.ts");
    expect(specs).toContain("e2e/public-pages.spec.ts");
  });

  test("specsByTag finds @smoke and @public specs in the real repo", () => {
    const smoke = specsByTag("smoke");
    const pub = specsByTag("public");
    expect(smoke.length).toBeGreaterThan(3);
    expect(pub).toContain("e2e/public-pages.spec.ts");
  });
});

describe("selectSpecs (AC1-AC3)", () => {
  test("AC1: expense-search変更なら mapのspec + @smoke が選ばれる", () => {
    const result = selectSpecs({ changedFiles: ["src/features/expense-search/pages/x.ts"] });
    expect(result.specs).toContain("e2e/expense-search.spec.ts");
    const smoke = specsByTag("smoke");
    for (const spec of smoke) expect(result.specs).toContain(spec);
    expect(result.fallback).toBe(false);
  });

  test("AC2: docsのみなら runtimeRelevant=false でspecs空", () => {
    const result = selectSpecs({ changedFiles: ["docs/development-process.md", "AGENTS.md"] });
    expect(result.runtimeRelevant).toBe(false);
    expect(result.specs).toEqual([]);
  });

  test("AC3: mapにないパスは @smoke+@public 全件fallback＋ファイル名列挙", () => {
    const result = selectSpecs({
      changedFiles: ["vite.config.ts", "src/features/expense-search/a.ts"],
    });
    expect(result.fallback).toBe(true);
    expect(result.unmapped).toContain("vite.config.ts");
    for (const spec of specsByTag("public")) expect(result.specs).toContain(spec);
    for (const spec of specsByTag("smoke")) expect(result.specs).toContain(spec);
  });

  test("metadata/process-onlyな変更はunmappedにしない", () => {
    const result = selectSpecs({
      changedFiles: [
        "src/features/expense-search/a.ts",
        "docs/guide.md",
        "scripts/loop-runner.mjs",
      ],
    });
    expect(result.unmapped).toEqual([]);
    expect(result.fallback).toBe(false);
  });

  test("変更された e2e spec 自身は実行対象に含まれる", () => {
    const result = selectSpecs({ changedFiles: ["e2e/settings.spec.ts"] });
    expect(result.specs).toContain("e2e/settings.spec.ts");
  });

  test("--include のspecは runtimeRelevant=false でも返る", () => {
    const result = selectSpecs({
      changedFiles: ["docs/a.md"],
      includeSpecs: ["e2e/settings.spec.ts"],
    });
    expect(result.specs).toEqual(["e2e/settings.spec.ts"]);
  });

  test("spec名globはe2e直下の実ファイルへ展開される", () => {
    const dir = fixture({
      "a.spec.ts": "// @smoke",
      "a.extra.spec.ts": "// @public",
      "b.spec.ts": "// @smoke",
    });
    const specFiles = listSpecFiles(path.join(dir, "e2e"));
    const { specs } = mapChangedFiles(
      ["custom/path/x.ts"],
      { "custom/path/**": ["e2e/a*.spec.ts"] },
      specFiles,
    );
    expect([...specs].sort()).toEqual(["e2e/a.extra.spec.ts", "e2e/a.spec.ts"]);
  });

  test("コメント内の@タグ言及はタグ扱いしない", () => {
    const dir = fixture({
      "real.spec.ts": 'test("@smoke 実タグ", async () => {});',
      "mention.spec.ts":
        '// これは @smoke を説明するコメント\n/* @public も同様 */\ntest("x", async () => {});',
    });
    const specFiles = listSpecFiles(path.join(dir, "e2e"));
    expect(specsByTag("smoke", { specFiles, cwd: dir })).toEqual(["e2e/real.spec.ts"]);
    expect(specsByTag("public", { specFiles, cwd: dir })).toEqual([]);
  });

  test("削除されたspecやmap内の陳腐なリテラル名は選定に残らない", () => {
    const dir = fixture({
      "kept.spec.ts": 'test("@smoke x", async () => {});',
    });
    writeFileSync(
      path.join(dir, "e2e", "spec-map.json"),
      JSON.stringify({ "src/a/**": ["e2e/kept.spec.ts", "e2e/deleted.spec.ts"] }),
    );
    const specFiles = listSpecFiles(path.join(dir, "e2e"));
    const result = selectSpecs({
      changedFiles: ["src/a/x.ts", "e2e/removed.spec.ts"],
      cwd: dir,
      specFiles,
      map: loadSpecMap(path.join(dir, "e2e", "spec-map.json")),
    });
    expect(result.specs).toContain("e2e/kept.spec.ts");
    expect(result.specs).not.toContain("e2e/deleted.spec.ts");
    expect(result.specs).not.toContain("e2e/removed.spec.ts");
  });
});

describe("parseArguments", () => {
  test("base/head/includeを読む", () => {
    const args = parseArguments([
      "--base",
      "a".repeat(40),
      "--head",
      "b".repeat(40),
      "--include",
      "e2e/x.spec.ts",
      "--include",
      "e2e/y.spec.ts",
    ]);
    expect(args.includeSpecs).toEqual(["e2e/x.spec.ts", "e2e/y.spec.ts"]);
  });
  test("base/head必須", () => {
    expect(() => parseArguments(["--base", "a".repeat(40)])).toThrow(/--head/);
  });
});
