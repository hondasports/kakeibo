import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyIncludes,
  runPrepush,
  sanitizeHookEnv,
  unitRelatedTargets,
} from "./verify-prepush.mjs";

const dirs = [];
function tmpdirFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "prepush-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, ".git"), { recursive: true });
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

function gitOpsFor() {
  return {
    head: () => HEAD,
    base: () => BASE,
    changedFiles: () => [],
  };
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function collectOut() {
  const lines = [];
  return { lines, out: (msg) => lines.push(msg) };
}

describe("classifyIncludes", () => {
  test("unit test → unitTests、e2e spec → missing（pre-pushではE2Eを実行しない）", () => {
    const exists = (p) => p === "e2e/settings.spec.ts" || p === "src/foo.test.ts";
    const result = classifyIncludes(["e2e/settings.spec.ts", "src/foo.test.ts"], { exists });
    expect(result.unitTests).toEqual(["src/foo.test.ts"]);
    expect(result.missing[0]).toContain("e2e/settings.spec.ts");
    expect(result.missing[0]).toContain("e2e:isolated");
  });
  test("存在しないファイルはmissing", () => {
    const result = classifyIncludes(["x/none.test.ts"], { exists: () => false });
    expect(result.missing[0]).toContain("x/none.test.ts");
  });
  test("テストでもe2e specでもないファイルはmissing", () => {
    const result = classifyIncludes(["src/app.ts"], { exists: () => true });
    expect(result.missing.length).toBe(1);
  });
  test("vitest対象外のパス（e2e配下の.test.ts・integration.test・絶対パス）はmissing", () => {
    const result = classifyIncludes(
      ["e2e/helper.test.ts", "src/x.integration.test.ts", "/abs/src/a.test.ts", "../out.test.ts"],
      { exists: () => true },
    );
    expect(result.unitTests).toEqual([]);
    expect(result.missing.length).toBe(4);
  });
});

describe("unitRelatedTargets", () => {
  test("メタデータ・.md・.json・e2eはrelated対象外", () => {
    const exists = () => true;
    const targets = unitRelatedTargets(
      [
        "scripts/x.mjs",
        ".husky/pre-push",
        "docs/a.md",
        "package.json",
        "e2e/a.spec.ts",
        "src/app.ts",
        "convex/schema.ts",
      ],
      { exists },
    );
    expect(targets).toEqual(["scripts/x.mjs", "src/app.ts", "convex/schema.ts"]);
  });
});

describe("runPrepush", () => {
  test("hook由来のGIT_*は各stepの環境から除く", async () => {
    const env = { GIT_DIR: "dummy", PATH: "/bin" };
    const calls = [];
    const code = await runPrepush({
      cwd: repoRoot,
      env,
      changedFilesOverride: ["src/features/expense-search/pages/ExpenseSearchPage.tsx"],
      gitOps: gitOpsFor(),
      out: () => {},
      runStep: (_cmd, args, _cwd, _log, stepEnv) => {
        calls.push({ args, env: stepEnv });
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(calls.some(({ args }) => args.includes("e2e:isolated"))).toBe(false);
    for (const call of calls) {
      expect(call.env.GIT_DIR).toBeUndefined();
      expect(call.env.PATH).toBe("/bin");
    }
  });
  test("docsのみならunitはfs依存mapに当たるテストだけ。e2e stepは存在しない", async () => {
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
      gitOps: gitOpsFor(),
      out,
    });
    expect(code).toBe(0);
    expect(calls.some((c) => c.args.includes("e2e:isolated"))).toBe(false);
    const unitCalls = calls.filter((c) => c.args.includes("vitest")).map((c) => c.args.join(" "));
    expect(unitCalls).toHaveLength(1);
    expect(unitCalls[0]).toContain("skills/skills.test.mjs");
    expect(lines.join("\n")).toContain("PASS");
  });

  test("feature変更ならunit(related)が対象のファイルを実行する", async () => {
    const calls = [];
    const { out } = collectOut();
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["src/features/expense-search/pages/ExpenseSearchPage.tsx"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(),
      out,
    });
    expect(code).toBe(0);
    const unitCall = calls.find((c) => c.includes("vitest related"));
    expect(unitCall).toContain("src/features/expense-search/pages/ExpenseSearchPage.tsx");
    expect(calls.some((c) => c.includes("e2e:isolated"))).toBe(false);
  });

  test("失敗時に step名・再実行・log path を出して先で止まる", async () => {
    const calls = [];
    const { lines, out } = collectOut();
    let n = 0;
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: [
        "src/features/expense-search/pages/ExpenseSearchPage.tsx",
        "scripts/a.mjs",
      ],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        n += 1;
        return n === 4 ? 1 : 0; // unit-relatedで失敗
      },
      gitOps: gitOpsFor(),
      out,
    });
    expect(code).toBe(1);
    expect(calls.length).toBe(4); // typecheck/lint/format/unit-related で停止
    const tail = lines.at(-1);
    expect(tail).toContain("FAILED");
    expect(tail).toContain("再実行:");
    expect(tail).toContain("log:");
  });

  test("--include: e2e specはmissingでexit 1、unit追加は実行、不存在はexit 1", async () => {
    // e2e spec include: pre-pushではE2Eを実行しないのでmissingとして拒否
    const code = await runPrepush({
      argv: ["--include", "e2e/settings.spec.ts"],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: () => 0,
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code).toBe(1);

    // unit test include
    const unitCalls = [];
    const dir = tmpdirFixture();
    writeFileSync(path.join(dir, "x.test.ts"), "// test");
    const code2 = await runPrepush({
      argv: ["--include", "x.test.ts"],
      cwd: dir,
      changedFilesOverride: ["docs/a.md"],
      runStep: (cmd, args, cwd2, log) => {
        unitCalls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code2).toBe(0);
    expect(unitCalls.find((c) => c.includes("vitest run"))).toContain("x.test.ts");

    // 不存在 → exit 1
    const code3 = await runPrepush({
      argv: ["--include", "x/ghost.test.ts"],
      cwd: repoRoot,
      changedFilesOverride: ["docs/a.md"],
      runStep: () => 0,
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code3).toBe(1);
  });

  test("fsで読むファイルの変更はmap経由でそのテストをrelated対象にする", async () => {
    const calls = [];
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["docs/line/rich-menu-readonly-summary.png"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code).toBe(0);
    const unitCall = calls.find((c) => c.includes("vitest related"));
    expect(unitCall).toContain("docs/line/rich-menu-readonly-summary.png");
    expect(unitCall).toContain("lib/domain/lineSummary/richMenu.test.ts");
    expect(unitCall).toContain("lib/convex/lineWebhook/lineRichMenuClient.test.ts");
  });

  test(".mdのみの変更でもmapに当たればunit stepが走る", async () => {
    const calls = [];
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["AGENTS.md"],
      runStep: (cmd, args, cwd, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code).toBe(0);
    expect(calls.length).toBe(4); // typecheck/lint/format/unit-related
    const unitCall = calls.find((c) => c.includes("vitest related"));
    expect(unitCall).toContain("skills/skills.test.mjs");
    expect(unitCall).not.toContain("AGENTS.md");
  });

  test("mapにあって存在しないテストは対象外にする", async () => {
    const dir = tmpdirFixture();
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    writeFileSync(
      path.join(dir, "scripts", "unit-related-map.json"),
      JSON.stringify({ "assets/*.png": ["x.test.ts", "ghost.test.ts"] }),
    );
    writeFileSync(path.join(dir, "x.test.ts"), "// test");
    const calls = [];
    const code = await runPrepush({
      argv: [],
      cwd: dir,
      changedFilesOverride: ["assets/a.png"],
      runStep: (cmd, args, cwd2, log) => {
        calls.push(args.join(" "));
        writeFileSync(log, "x");
        return 0;
      },
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code).toBe(0);
    const unitCall = calls.find((c) => c.includes("vitest related"));
    expect(unitCall).toContain("x.test.ts");
    expect(unitCall).not.toContain("ghost.test.ts");
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
});
