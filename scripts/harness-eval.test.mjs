import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "harness-eval.mjs");
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const tmpDirs = [];
const tmp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "harness-eval-"));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

/** Fixture repo: minimal git history with a base commit + a harness ref commit. */
function makeFixtureRepo() {
  const repo = tmp();
  const g = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  g(["init", "-b", "main"]);
  g(["config", "user.email", "eval@test"]);
  g(["config", "user.name", "eval"]);
  mkdirSync(path.join(repo, "docs"), { recursive: true });
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ scripts: { test: "old", "test:process": "old" } }),
  );
  writeFileSync(path.join(repo, "docs", "guide.md"), "old doc\n");
  writeFileSync(path.join(repo, "scripts", "loop-runner.mjs"), "// old runner\n");
  g(["add", "-A"]);
  g(["commit", "-m", "base"]);
  const base = g(["rev-parse", "HEAD"]);
  // Harness ref: newer harness content on a branch.
  g(["checkout", "-b", "harness-new"]);
  writeFileSync(path.join(repo, "scripts", "loop-runner.mjs"), "// NEW runner\n");
  mkdirSync(path.join(repo, "scripts", "agent-hooks"), { recursive: true });
  writeFileSync(path.join(repo, "scripts", "agent-hooks", "claude-pre-edit.mjs"), "// hook\n");
  writeFileSync(path.join(repo, "AGENTS.md"), "# new contract\n");
  writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({
      scripts: {
        test: "old",
        "test:process": "vitest run scripts/loop-runner.test.mjs",
        "e2e:isolated": "ci-convex",
      },
    }),
  );
  g(["add", "-A"]);
  g(["commit", "-m", "harness new"]);
  const harnessRef = g(["rev-parse", "HEAD"]);
  g(["checkout", "main"]);
  return { repo, base, harnessRef };
}

// The module is imported once per test file; golden-set/harness-paths reads are
// bound to REPO_ROOT, so unit-level checks exercise exported pure helpers via a
// fixture copy of the module where the eval dir is patched in. The fixture file
// must live inside the repo root or vite-node refuses to load it.
function loadModuleWithFixtureEval(evalDir) {
  const src = readFileSync(SCRIPT, "utf8")
    .replace(
      `path.join(REPO_ROOT, "eval/harness/golden-set.json")`,
      JSON.stringify(path.join(evalDir, "golden-set.json")),
    )
    .replace(
      `path.join(REPO_ROOT, "eval/harness/harness-paths.json")`,
      JSON.stringify(path.join(evalDir, "harness-paths.json")),
    );
  const dir = mkdtempSync(path.join(REPO_ROOT, "scripts/.fixture-harness-eval-"));
  tmpDirs.push(dir);
  const mod = path.join(dir, "harness-eval.fixture.mjs");
  writeFileSync(mod, src);
  return import(mod);
}

function fixtureEvalDir() {
  const dir = path.join(tmp(), "eval-harness");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "golden-set.json"),
    JSON.stringify({
      tasks: [
        {
          id: "fx-docs",
          baseCommit: "BASE",
          referenceCommit: "REF",
          humanRequest: "do docs",
          acceptanceCriteria: ["doc exists"],
          oracle: {
            type: "docs",
            requiredContent: [{ file: "docs/guide.md", contains: "new doc" }],
          },
          expectedMinTier: "T1",
        },
        {
          id: "fx-tests",
          baseCommit: "BASE",
          referenceCommit: "REF",
          humanRequest: "do tests",
          acceptanceCriteria: ["works"],
          oracle: { type: "tests", tests: ["a.test.mjs"] },
          expectedMinTier: "T2",
        },
      ],
    }),
  );
  writeFileSync(
    path.join(dir, "harness-paths.json"),
    JSON.stringify({
      paths: ["AGENTS.md", "scripts/loop-*.mjs", "scripts/agent-hooks", "missing/dir"],
      npmScripts: ["test:process", "e2e:isolated", "missing:script"],
    }),
  );
  return dir;
}

describe("expandHarnessPattern / harnessFiles", () => {
  test("expands files, dirs and globs; missing paths are ignored", async () => {
    const { repo, harnessRef } = makeFixtureRepo();
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const files = mod.harnessFiles(repo, harnessRef);
    expect(files).toContain("AGENTS.md");
    expect(files).toContain("scripts/loop-runner.mjs");
    expect(files).toContain("scripts/agent-hooks/claude-pre-edit.mjs");
    expect(files.some((f) => f.startsWith("missing/"))).toBe(false);
  });
});

describe("harnessPathsDoc", () => {
  test("reads the paths list from <ref> so newer harnesses self-describe", async () => {
    const { repo, harnessRef } = makeFixtureRepo();
    const g = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    // Commit a ref-local paths doc that lists only AGENTS.md + a custom script.
    g(["checkout", "harness-new"]);
    mkdirSync(path.join(repo, "eval", "harness"), { recursive: true });
    writeFileSync(
      path.join(repo, "eval", "harness", "harness-paths.json"),
      JSON.stringify({ paths: ["AGENTS.md"], npmScripts: ["custom:script"] }),
    );
    g(["add", "-A"]);
    g(["commit", "-m", "ref paths doc"]);
    const refWithDoc = g(["rev-parse", "HEAD"]);
    g(["checkout", "main"]);
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    // ref doc wins over the caller-side fixture doc (which lists agent-hooks etc.)
    const files = mod.harnessFiles(repo, refWithDoc);
    expect(files).toEqual(["AGENTS.md"]);
    expect(mod.harnessPathsDoc(repo, refWithDoc).npmScripts).toEqual(["custom:script"]);
    // Ref without the file falls back to the caller's own list.
    const fallbackFiles = mod.harnessFiles(repo, harnessRef);
    expect(fallbackFiles).toContain("scripts/loop-runner.mjs");
  });
});

describe("overlayHarness", () => {
  test("copies ref files and merges only the listed npmScripts", async () => {
    const { repo, harnessRef } = makeFixtureRepo();
    const work = tmp();
    // Fake worktree content at base.
    writeFileSync(
      path.join(work, "package.json"),
      JSON.stringify({ scripts: { test: "old", "test:process": "old" } }),
    );
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const { files, mergedScripts } = mod.overlayHarness(repo, work, harnessRef);
    expect(files).toContain("scripts/loop-runner.mjs");
    expect(readFileSync(path.join(work, "scripts", "loop-runner.mjs"), "utf8")).toBe(
      "// NEW runner\n",
    );
    const pkg = JSON.parse(readFileSync(path.join(work, "package.json"), "utf8"));
    expect(pkg.scripts["test:process"]).toBe("vitest run scripts/loop-runner.test.mjs");
    expect(pkg.scripts["e2e:isolated"]).toBe("ci-convex");
    expect(pkg.scripts.test).toBe("old"); // unlisted keys stay at base version
    expect(pkg.scripts["missing:script"]).toBeUndefined();
    expect(mergedScripts).toEqual(["test:process", "e2e:isolated"]);
  });
});

describe("buildAgentSpec", () => {
  test("excludes oracle content and marks prAllowed false (AC1)", async () => {
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const spec = mod.buildAgentSpec({
      humanRequest: "req",
      acceptanceCriteria: ["a", "b"],
      expectedMinTier: "T2",
      oracle: { type: "tests", tests: ["secret.test.mjs"] },
    });
    const text = JSON.stringify(spec);
    expect(text).not.toContain("secret.test.mjs");
    // spec.schema.json is additionalProperties:false until #950 adds prAllowed.
    expect(spec.prAllowed).toBeUndefined();
    expect(text).toContain("PR作成は行わない");
    expect(spec.acceptanceCriteria).toHaveLength(2);
    expect(spec.predictedRisk).toBe("T2");
  });
});

describe("report", () => {
  test("diffs two JSONL files by id; missing ids shown as 欠損 (AC3)", async () => {
    const dir = tmp();
    const base = path.join(dir, "b.jsonl");
    const cand = path.join(dir, "c.jsonl");
    const summary = (id, tokens, calls) =>
      JSON.stringify({
        taskId: id,
        tokens: {
          implementer: { input: tokens, output: 0, cachedInput: 0 },
          reviewer: { input: 0, output: 0, cachedInput: 0 },
        },
        modelCalls: { implementer: calls, reviewer: 0 },
        runnerCommands: 3,
        reviewRounds: 1,
      });
    writeFileSync(base, `${summary("g1", 100, 2)}\n${summary("g2", 50, 1)}\n`);
    writeFileSync(
      cand,
      `${summary("g1", 80, 2)}\n${JSON.stringify({ taskId: "g1", oracle: { pass: true } })}\n${summary("g3", 10, 1)}\n`,
    );
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const { rows, table } = mod.report({ baseline: base, candidate: cand });
    expect(table).toContain("欠損");
    const g1 = rows.find((r) => r.id === "g1");
    expect(g1.tokens.baseline).toBe(100);
    expect(g1.tokens.candidate).toBe(80);
    expect(g1.tokens.delta).toBe(-20);
    expect(g1.oracle.candidate).toBe("pass");
    const g2 = rows.find((r) => r.id === "g2");
    expect(g2.candidate).toBe("欠損");
    const g3 = rows.find((r) => r.id === "g3");
    expect(g3.baseline).toBe("欠損");
  });
});

describe("report: unmeasured usage (#985)", () => {
  test("null tokens/modelCalls are shown as 未計測 and produce no delta", async () => {
    const dir = tmp();
    const base = path.join(dir, "b.jsonl");
    const cand = path.join(dir, "c.jsonl");
    const unmeasured = JSON.stringify({
      taskId: "g1",
      tokens: { implementer: null, reviewer: null },
      modelCalls: { implementer: null, reviewer: null },
    });
    const measured = JSON.stringify({
      taskId: "g1",
      tokens: {
        implementer: { input: 80, output: 0, cachedInput: 0 },
        reviewer: null,
      },
      modelCalls: { implementer: 3, reviewer: null },
    });
    writeFileSync(base, `${unmeasured}\n`);
    writeFileSync(cand, `${measured}\n`);
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const { rows } = mod.report({ baseline: base, candidate: cand });
    const g1 = rows.find((r) => r.id === "g1");
    expect(g1.tokens).toEqual({ baseline: "未計測", candidate: 80 });
    expect(g1.modelCalls).toEqual({ baseline: "未計測", candidate: 3 });
  });

  test("the committed baseline has no zero-filled tokens (AC4)", () => {
    const file = path.join(path.dirname(SCRIPT), "..", "eval", "harness", "baseline");
    for (const name of readdirSync(file)) {
      for (const line of readFileSync(path.join(file, name), "utf8").split("\n")) {
        if (!line.trim()) continue;
        const record = JSON.parse(line);
        if (!record.tokens) continue;
        expect(record.tokens).toEqual({ implementer: null, reviewer: null });
        expect(record.modelCalls).toEqual({ implementer: null, reviewer: null });
      }
    }
  });
});

describe("git guard (AC8)", () => {
  test("git push / gh pr are rejected before execution", async () => {
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    expect(() => mod.git(tmp(), ["push", "origin", "x"])).toThrow(/never/);
    expect(() => mod.git(tmp(), ["pr", "create"])).toThrow(/never/);
    // f-4: option-first bypass (`git -c k=v push`) is rejected too.
    expect(() => mod.git(tmp(), ["-c", "k=v", "push", "origin", "x"])).toThrow(/never/);
    // CLI source must not shell out to gh (PR creation) at all.
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).not.toMatch(/execFileSync\("gh"/);
    expect(src).not.toMatch(/["'`]gh["'`]/);
  });
});

describe("globToRegExp", () => {
  test("**/ matches zero or more leading segments", async () => {
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const re = mod.globToRegExp("a/**/b.test.mjs");
    expect(re.test("a/b.test.mjs")).toBe(true); // direct child (zero dirs)
    expect(re.test("a/x/b.test.mjs")).toBe(true);
    expect(re.test("a/x/y/b.test.mjs")).toBe(true);
    expect(re.test("b/b.test.mjs")).toBe(false);
    expect(mod.globToRegExp("scripts/loop-*.mjs").test("scripts/loop-runner.mjs")).toBe(true);
    expect(mod.globToRegExp("scripts/loop-*.mjs").test("scripts/x/loop.mjs")).toBe(false);
  });
});

describe("parseCli", () => {
  test("--expect-fail is a bare boolean flag (f-2)", async () => {
    const mod = await loadModuleWithFixtureEval(fixtureEvalDir());
    const { options } = mod.parseCli(["grade", "g1", "--dir", "/x", "--expect-fail"]);
    expect(options["expect-fail"]).toBe(true);
    expect(() => mod.parseCli(["grade", "g1", "--dir"])).toThrow(/requires a value/);
  });
});

describe("docs oracle (g1-style)", () => {
  test("grade passes when required content exists, fails otherwise", async () => {
    const evalDir = fixtureEvalDir();
    const mod = await loadModuleWithFixtureEval(evalDir);
    const work = tmp();
    mkdirSync(path.join(work, "docs"), { recursive: true });
    writeFileSync(path.join(work, ".git"), "gitdir: x");
    writeFileSync(path.join(work, "docs", "guide.md"), "old doc\n");
    const bad = mod.grade("fx-docs", { dir: work });
    expect(bad.oracle.pass).toBe(false);
    expect(bad.oracle.failedTests[0]).toContain("new doc");
    writeFileSync(path.join(work, "docs", "guide.md"), "new doc\n");
    const good = mod.grade("fx-docs", { dir: work });
    expect(good.oracle.pass).toBe(true);
  });
});
