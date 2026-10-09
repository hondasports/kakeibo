import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyIncludes,
  e2ePreflight,
  portBusy,
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
      gitOps: gitOpsFor(),
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
      gitOps: gitOpsFor(),
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
      gitOps: gitOpsFor(),
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
      gitOps: gitOpsFor(),
      out,
    });
    expect(code).toBe(1);
    expect(calls.some((c) => c.includes("e2e:isolated"))).toBe(false);
    const tail = lines.at(-1);
    expect(tail).toContain("ポート 5173 が使用中");
    expect(tail).toContain("Chromium未インストール");
  });

  test("unmapped注意はstep失敗より先に出る", async () => {
    const { lines, out } = collectOut();
    const code = await runPrepush({
      argv: [],
      cwd: repoRoot,
      changedFilesOverride: ["vite.config.ts"], // spec-map未収載 → unmapped
      runStep: () => 1, // 最初のstepで失敗
      preflight: async () => [],
      gitOps: gitOpsFor(),
      out,
    });
    expect(code).toBe(1);
    const text = lines.join("\n");
    expect(text.indexOf("spec-mapにないパス")).toBeLessThan(text.indexOf("FAILED"));
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
      gitOps: gitOpsFor(),
      out: () => {},
    });
    expect(code).toBe(0);
    expect(calls.find((c) => c.includes("e2e:isolated"))).toContain("e2e/settings.spec.ts");

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
      preflight: async () => [],
      gitOps: gitOpsFor(),
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
      gitOps: gitOpsFor(),
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
});

describe("portBusy", () => {
  const fakeSocket = (fire) => ({
    once: (ev, cb) => {
      if (ev === fire) cb(new Error("refused"));
    },
    destroy: () => {},
    setTimeout: () => {},
  });
  test("connect成功すればbusy", async () => {
    expect(
      await portBusy(5173, { hosts: ["127.0.0.1"], connect: () => fakeSocket("connect") }),
    ).toBe(true);
  });
  test("connect失敗なら空き", async () => {
    expect(await portBusy(5173, { hosts: ["127.0.0.1"], connect: () => fakeSocket("error") })).toBe(
      false,
    );
  });
  test("複数ホストでどれか1つでも繋がればbusy（IPv6側も見る）", async () => {
    const seen = [];
    const connect = ({ host }) => {
      seen.push(host);
      return fakeSocket(host === "::1" ? "connect" : "error");
    };
    expect(await portBusy(3210, { connect })).toBe(true);
    expect(seen).toEqual(["127.0.0.1", "::1"]);
  });
  test("connect自体がthrowしてもfalse（投げない）", async () => {
    expect(
      await portBusy(5173, {
        hosts: ["127.0.0.1"],
        connect: () => {
          throw new Error("bad family");
        },
      }),
    ).toBe(false);
  });
});

describe("e2ePreflight", () => {
  const okDeps = {
    ports: [],
    requiredEnv: ["AAA", "E2E_CLERK_USER_ID"],
    checkPort: async () => false,
    // chromiumPathはexistsSyncされるので実在ファイルを返す
    chromiumPath: () => fileURLToPath(import.meta.url),
    backendBinaryPresent: async () => true,
    networkReachable: async () => true,
  };
  const withEnv = async (vars, fn) => {
    const saved = {};
    for (const key of Object.keys(vars)) {
      saved[key] = process.env[key];
      process.env[key] = vars[key];
    }
    try {
      return await fn();
    } finally {
      for (const [key, val] of Object.entries(saved)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
    }
  };
  test("port占有は失敗として列挙", async () => {
    const failures = await e2ePreflight({
      ...okDeps,
      ports: [{ port: 5173, label: "Vite dev" }],
      checkPort: async (port) => port === 5173,
    });
    expect(failures.join("\n")).toContain("5173");
    expect(failures.join("\n")).toContain("Vite dev");
  });
  test("envはprocess.envまたは.env.localのどちらでも満たせる", async () => {
    const dir = tmpdirFixture();
    // .env.local無し・process.envにあり → 失敗しない
    await withEnv({ AAA: "1", E2E_CLERK_USER_ID: "u1" }, async () => {
      const failures = await e2ePreflight({ ...okDeps, cwd: dir });
      expect(failures).toEqual([]);
    });
    // .env.localのみ → 失敗しない
    writeFileSync(path.join(dir, ".env.local"), "AAA=1\nE2E_CLERK_USER_ID=u1\n");
    const failures = await e2ePreflight({ ...okDeps, cwd: dir });
    expect(failures).toEqual([]);
  });
  test("env不足はprocess.envにも.env.localにも無い場合だけ失敗", async () => {
    const dir = tmpdirFixture();
    writeFileSync(path.join(dir, ".env.local"), "AAA=1\n");
    const saved = process.env.E2E_CLERK_USER_ID;
    delete process.env.E2E_CLERK_USER_ID;
    try {
      const failures = await e2ePreflight({ ...okDeps, cwd: dir });
      expect(failures.join("\n")).toContain("E2E_CLERK_USER_ID");
      expect(failures).toHaveLength(1);
    } finally {
      if (saved !== undefined) process.env.E2E_CLERK_USER_ID = saved;
    }
  });
  test("backend binary不在かつnetwork不可のみ失敗", async () => {
    const dir = tmpdirFixture();
    await withEnv({ AAA: "1", E2E_CLERK_USER_ID: "u" }, async () => {
      const offline = await e2ePreflight({
        ...okDeps,
        cwd: dir,
        backendBinaryPresent: async () => false,
        networkReachable: async () => false,
      });
      expect(offline.join("\n")).toContain("Convex local backend");
      const online = await e2ePreflight({
        ...okDeps,
        cwd: dir,
        backendBinaryPresent: async () => false,
        networkReachable: async () => true,
      });
      expect(online.join("\n")).not.toContain("Convex local backend");
    });
  });
  test("Chromium未導入を検出", async () => {
    const dir = tmpdirFixture();
    await withEnv({ AAA: "1", E2E_CLERK_USER_ID: "u" }, async () => {
      const failures = await e2ePreflight({ ...okDeps, cwd: dir, chromiumPath: () => null });
      expect(failures.join("\n")).toContain("Chromium");
    });
  });
});
