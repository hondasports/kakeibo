import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyIncludes,
  markerDir,
  needsProcessSuite,
  runPrepush,
  sanitizeHookEnv,
  unitRelatedTargets,
} from "./verify-prepush.mjs";

const dirs = [];
function tmpdirFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "prepush-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, ".git"), { recursive: true });
  mkdirSync(path.join(dir, "e2e"), { recursive: true });
  writeFileSync(path.join(dir, "e2e", "spec-map.json"), "{}");
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

function gitOpsFor(root, { dirty = false } = {}) {
  return {
    head: () => HEAD,
    base: () => BASE,
    changedFiles: () => [],
    dirty: () => dirty,
    // markerDir() calls git rev-parse — stub via marker dir layout inside root/.git
  };
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/** runPrepushのmarker出力先をテスト用tmpdirへ差し替えるdeps。 */
function markerDeps() {
  const dir = mkdtempSync(path.join(tmpdir(), "prepush-markers-"));
  dirs.push(dir);
  return { markerBaseDir: () => dir, markerDir: dir };
}

function collectOut() {
  const lines = [];
  return { lines, out: (msg) => lines.push(msg) };
}

describe("classifyIncludes (AC9)", () => {
  test("e2e spec → e2eSpecs、unit test → unitTests", () => {
    const exists = (p) => p === "e2e/settings.spec.ts" || p === "src/foo.test.ts";
    const result = classifyIncludes(["e2e/settings.spec.ts", "src/foo.test.ts"], { exists });
    expect(result.e2eSpecs).toEqual(["e2e/settings.spec.ts"]);
    expect(result.unitTests).toEqual(["src/foo.test.ts"]);
    expect(result.missing).toEqual([]);
  });
  test("存在しないファイルはmissing", () => {
    const result = classifyIncludes(["e2e/none.spec.ts"], { exists: () => false });
    expect(result.missing[0]).toContain("e2e/none.spec.ts");
  });
  test("テストでもe2e specでもないファイルはmissing", () => {
    const result = classifyIncludes(["src/app.ts"], { exists: () => true });
    expect(result.missing.length).toBe(1);
  });
});

describe("unitRelatedTargets / needsProcessSuite", () => {
  test("scripts/.agent/.md/.json/e2eはrelated対象外", () => {
    const exists = () => true;
    const targets = unitRelatedTargets(
      [
        "scripts/x.mjs",
        ".agent/process.yaml",
        "docs/a.md",
        "package.json",
        "e2e/a.spec.ts",
        "src/app.ts",
        "convex/schema.ts",
      ],
      { exists },
    );
    expect(targets).toEqual(["src/app.ts", "convex/schema.ts"]);
  });
  test("scripts/.agent/docs-agent-harnessの変更でprocess起動", () => {
    expect(needsProcessSuite(["src/a.ts"])).toBe(false);
    expect(needsProcessSuite(["scripts/x.mjs"])).toBe(true);
    expect(needsProcessSuite([".agent/process.yaml"])).toBe(true);
    expect(needsProcessSuite(["docs/agent-harness.md"])).toBe(true);
    expect(needsProcessSuite(["docs/development-process.md"])).toBe(false);
  });
});

describe("runPrepush", () => {
  test("AC2: docsのみなら unit/e2eなしで数秒（3ステップのみ）", async () => {
    const { lines, out } = collectOut();
    const calls = [];
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md", "docs/b.md"],
      runStep: (cmd, args, cwd, log) => {
        calls.push({ cmd, args });
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      out,
    });
    expect(code).toBe(0);
    expect(calls.length).toBe(3); // typecheck, lint, format
    expect(calls.map((c) => c.args[1] ?? c.args[0])).not.toContain("vitest");
    expect(lines.join("\n")).toContain("PASS");
  });

  test("AC1相当: feature変更なら unit(related)+e2e spec選定で実行", async () => {
    const calls = [];
    const { lines, out } = collectOut();
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["src/features/expense-search/index.ts"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      preflight: async () => [],
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      markerBaseDir: markerDeps().markerBaseDir,
      out,
    });
    expect(code).toBe(0);
    const e2eCall = calls.find((c) => c.includes("e2e:isolated"));
    expect(e2eCall).toContain("e2e/expense-search.spec.ts");
    const unitCall = calls.find((c) => c.includes("vitest related"));
    expect(unitCall).toContain("src/features/expense-search/index.ts");
  });

  test("AC3相当: unmapped変更はfallback（public specを含む）", async () => {
    const calls = [];
    const { out } = collectOut();
    await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["vite.config.ts"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      preflight: async () => [],
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      markerBaseDir: markerDeps().markerBaseDir,
      out,
    });
    const e2eCall = calls.find((c) => c.includes("e2e:isolated"));
    expect(e2eCall).toContain("e2e/public-pages.spec.ts");
  });

  test("AC4: 失敗時に step名・再実行・log path を出して先で止まる", async () => {
    const calls = [];
    const { lines, out } = collectOut();
    let n = 0;
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["src/features/expense-search/index.ts", "scripts/a.mjs"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        n += 1;
        return n === 4 ? 1 : 0; // unit-relatedで失敗
      },
      preflight: async () => [],
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      markerBaseDir: markerDeps().markerBaseDir,
      out,
    });
    expect(code).toBe(1);
    expect(calls.length).toBe(4); // typecheck/lint/format/unit-related で停止
    const tail = lines.at(-1);
    expect(tail).toContain("FAILED");
    expect(tail).toContain("再実行:");
    expect(tail).toContain("log:");
  });

  test("AC5: e2e事前条件NGならE2Eを実行せずexit 1＋条件列挙", async () => {
    const calls = [];
    const { lines, out } = collectOut();
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["src/features/expense-search/index.ts"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      preflight: async () => ["ポート 5173 が使用中", "Chromium未インストール"],
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      out,
    });
    expect(code).toBe(1);
    expect(calls.some((c) => c.includes("e2e:isolated"))).toBe(false);
    const tail = lines.at(-1);
    expect(tail).toContain("ポート 5173 が使用中");
    expect(tail).toContain("Chromium未インストール");
  });

  test("AC7/AC8: 全成功でHEAD.ok作成、dirtyなら作らない、失敗で削除", async () => {
    const { markerBaseDir, markerDir } = markerDeps();
    const head = HEAD;
    expect(existsSync(path.join(markerDir, `${head}.ok`))).toBe(false);
    // 成功 → marker作成
    const ok = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd, log) => {
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir,
      out: () => {},
    });
    expect(ok).toBe(0);
    expect(existsSync(path.join(markerDir, `${head}.ok`))).toBe(true);
    // 別HEADではtrueにならない (AC8)
    expect(existsSync(path.join(markerDir, `${"c".repeat(40)}.ok`))).toBe(false);
    // 失敗 → marker削除
    const fail = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd, log) => {
        writeFileSync(log, "x");
        return args.includes("lint") ? 1 : 0;
      },
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir,
      out: () => {},
    });
    expect(fail).toBe(1);
    expect(existsSync(path.join(markerDir, `${head}.ok`))).toBe(false);
    // dirty → marker作らない
    const dirty = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd, log) => {
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(repoRoot, { dirty: true }),
      markerBaseDir,
      out: () => {},
    });
    expect(dirty).toBe(0);
    expect(existsSync(path.join(markerDir, `${head}.ok`))).toBe(false);
    // marker prune: 20件を超えると古いものから消える
    for (let i = 0; i < 25; i++) {
      writeFileSync(path.join(markerDir, `${String(i).padStart(40, "0")}.ok`), "");
    }
    await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd, log) => {
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir,
      out: () => {},
    });
    expect(readdirSync(markerDir).filter((f) => f.endsWith(".ok")).length).toBeLessThanOrEqual(20);
  });

  test("AC9: --includeで spec追加・unit追加・不存在でexit 1", async () => {
    const calls = [];
    // e2e spec include: runtimeRelevant=falseのdocs変更でもE2Eが走る
    const code = await runPrepush({
      argv: ["--include", "e2e/settings.spec.ts"],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      preflight: async () => [],
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      out: () => {},
    });
    expect(code).toBe(0);
    expect(calls.find((c) => c.includes("e2e:isolated"))).toContain("e2e/settings.spec.ts");

    // unit test include
    const unitCalls = [];
    const dir = tmpdirFixture();
    writeFileSync(path.join(dir, "x.test.ts"), "// test");
    const { markerBaseDir: mbd2 } = markerDeps();
    const code2 = await runPrepush({
      argv: ["--include", "x.test.ts"],
      cwd: dir,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd2, log) => {
        unitCalls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      preflight: async () => [],
      gitOps: gitOpsFor(dir),
      markerBaseDir: mbd2,
      out: () => {},
    });
    expect(code2).toBe(0);
    expect(unitCalls.find((c) => c.includes("vitest run"))).toContain("x.test.ts");

    // 不存在 → exit 1
    const code3 = await runPrepush({
      argv: ["--include", "e2e/ghost.spec.ts"],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: () => 0,
      gitOps: gitOpsFor(repoRoot),
      markerBaseDir: markerDeps().markerBaseDir,
      out: () => {},
    });
    expect(code3).toBe(1);
  });
});

describe("hook env sanitization (pre-push経由のGIT_*汚染対策)", () => {
  test("sanitizeHookEnv removes GIT_* hook vars and keeps others", () => {
    const env = {
      GIT_DIR: ".",
      GIT_WORK_TREE: "/x",
      GIT_INDEX_FILE: "/x/index",
      GIT_QUARANTINE_PATH: "/x/q",
      GIT_PREFIX: "sub/",
      PATH: "/bin",
      FOO: "bar",
    };
    const clean = sanitizeHookEnv(env);
    expect(clean.GIT_DIR).toBeUndefined();
    expect(clean.GIT_WORK_TREE).toBeUndefined();
    expect(clean.GIT_INDEX_FILE).toBeUndefined();
    expect(clean.GIT_QUARANTINE_PATH).toBeUndefined();
    expect(clean.GIT_PREFIX).toBeUndefined();
    expect(clean.PATH).toBe("/bin");
    expect(clean.FOO).toBe("bar");
  });

  test("markerDir works even when GIT_DIR is poisoned (hook env leak regression)", () => {
    const prev = process.env.GIT_DIR;
    process.env.GIT_DIR = "/nonexistent-hack-dir";
    try {
      const dir = markerDir(repoRoot);
      expect(dir).toContain("agent-prepush");
    } finally {
      if (prev === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = prev;
    }
  });
});
