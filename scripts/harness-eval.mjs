#!/usr/bin/env node
/**
 * Golden-set eval for harness versions (Issue #943).
 *
 *   prepare <id> --dir <path> [--harness <git ref>] [--spec-out <path>]
 *     Materialize an eval worktree at golden[id].baseCommit, overlay the harness
 *     files listed in eval/harness/harness-paths.json from <ref> (default: HEAD)
 *     and delete the files it lists under `removedPaths`,
 *     commit the overlay locally (never pushed), and print the single
 *     `loop-runner.mjs --init` command the agent should run.
 *
 *     The worktree is a linked worktree of a `git clone --depth 1` of this repo,
 *     NOT of the canonical clone — so the eval repo's object db holds only the
 *     base commit and the overlay. `git show <other-commit>` fails inside it,
 *     which is the point: the oracle (referenceCommit objects, golden-set.json)
 *     does not exist in the eval repo. It is still not airtight isolation — an
 *     agent that re-adds the origin remote can fetch them — but there is no
 *     casual path (documented limitation, see eval/harness/README.md).
 *
 *   grade <id> --dir <path> [--out <file>]
 *     Apply the oracle of golden[id] to the worktree HEAD: overwrite the worktree
 *     with the oracle tests taken from referenceCommit and run vitest, or run the
 *     docs checks for docs oracles. Prints {pass, failedTests[]} and, with --out,
 *     appends one JSONL record {taskId, oracle:{...}}.
 *
 *   report --baseline <file> --candidate <file>
 *     Compare two collect-harness-metrics-style JSONL files by taskId and print a
 *     diff table (oracle, tokens, model calls, runner commands, wall time,
 *     review rounds). Ids missing on one side are shown as 欠損.
 *
 *   cleanup <id> --dir <path>
 *     Remove the eval worktree and its local eval/<id>/* branch.
 *
 * The eval never pushes and never creates PRs: every git/gh mutation is local.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const GOLDEN_SET_PATH = path.join(REPO_ROOT, "eval/harness/golden-set.json");
const HARNESS_PATHS_PATH = path.join(REPO_ROOT, "eval/harness/harness-paths.json");

const GOLDEN_SET = JSON.parse(readFileSync(GOLDEN_SET_PATH, "utf8"));
const HARNESS_PATHS = JSON.parse(readFileSync(HARNESS_PATHS_PATH, "utf8"));

/**
 * The overlay file list is self-describing: read it from <ref> so a harness
 * newer than the caller's checkout can introduce files the local list does
 * not know yet (e.g. scripts the new loop imports). Falls back to the
 * caller's own copy when the ref lacks the file or the ref cannot be read.
 */
export function harnessPathsDoc(repoRoot, ref, record) {
  try {
    return JSON.parse(
      git(repoRoot, ["show", `${ref}:eval/harness/harness-paths.json`], {
        record,
        quiet: true,
      }),
    );
  } catch {
    return HARNESS_PATHS;
  }
}

/**
 * Written at the worktree root by overlayHarness. Repo-wide consistency tests that
 * compare the overlaid harness with files of the historical base (e.g. spec-map's
 * e2e specs) skip when it exists; the base commit predates those files.
 */
export const OVERLAY_MARKER = ".harness-eval-overlay";

export const SUMMARY_KEYS = [
  "oracle",
  "tokens",
  "modelCalls",
  "runnerCommands",
  "wallTime",
  "reviewRounds",
];

/* ---------------------------------------------------------------- helpers */

function fail(message) {
  throw new Error(message);
}

function golden(id) {
  const entry = GOLDEN_SET.tasks.find((task) => task.id === id);
  if (!entry) fail(`unknown golden id: ${id}`);
  return entry;
}

/**
 * Reject remote-touching git verbs. Scans every arg (not just args[0]) so
 * `git -c k=v push` cannot slip past; every git call site funnels through
 * this check.
 */
function assertLocalGit(args) {
  for (const arg of args) {
    if (arg === "push" || arg === "pr") fail(`eval must never run: git ${arg}`);
  }
}

export function git(cwd, args, { record, quiet } = {}) {
  assertLocalGit(args);
  record?.push(["git", ...args]);
  // quiet: existence probes (cat-file -t) expect misses; keep stderr off the console
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "ignore" : "inherit"],
  }).trim();
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/**
 * Glob match (gitignore-ish): single-* and ? match within one path segment;
 * double-star-slash matches zero or more leading segments, and a trailing
 * double-star matches anything below.
 */
export function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        out += "(?:[^/]+/)*"; // `a/**/b` also matches the direct child `a/b`
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

/** Expand one harness-paths entry into concrete file paths existing at <ref>. */
export function expandHarnessPattern(repoRoot, ref, pattern, record) {
  const clean = pattern.replace(/\/+$/, "");
  if (clean.includes("*") || clean.includes("?")) {
    const anchor = clean.split("*")[0].split("?")[0];
    const dir = anchor.includes("/") ? anchor.slice(0, anchor.lastIndexOf("/")) : "";
    const names = git(repoRoot, ["ls-tree", "-r", "--name-only", ref, "--", dir || "."], {
      record,
    });
    const re = globToRegExp(clean);
    return names ? names.split("\n").filter((name) => re.test(name)) : [];
  }
  let type = "";
  try {
    type = git(repoRoot, ["cat-file", "-t", `${ref}:${clean}`], { record, quiet: true });
  } catch {
    return [];
  }
  if (type === "blob") return [clean];
  if (type === "tree") {
    const names = git(repoRoot, ["ls-tree", "-r", "--name-only", ref, "--", clean], { record });
    return names ? names.split("\n").filter(Boolean) : [];
  }
  return [];
}

/** All files the overlay should copy from <ref>. Missing paths are ignored. */
export function harnessFiles(repoRoot, ref, record) {
  const files = new Set();
  for (const pattern of harnessPathsDoc(repoRoot, ref, record).paths ?? []) {
    for (const file of expandHarnessPattern(repoRoot, ref, pattern, record)) files.add(file);
  }
  return [...files].sort();
}

function extractFile(repoRoot, ref, file, record) {
  const args = ["show", `${ref}:${file}`];
  assertLocalGit(args); // same funnel as git(); binary-safe so kept as execFileSync
  record?.push(["git", ...args]);
  return execFileSync("git", args, {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Delete the harness files <ref> removed (harness-paths.json `removedPaths`)
 * from dir. Entries are repo-relative files or directories. A path that still
 * exists at <ref>, or that escapes dir, is never deleted. Returns what was removed.
 */
export function removeStaleHarnessFiles(repoRoot, dir, ref, removedPaths, { record } = {}) {
  const removed = [];
  for (const entry of removedPaths) {
    const clean = path.posix.normalize(entry).replace(/\/+$/, "");
    if (!clean || clean === "." || clean.startsWith("..") || path.isAbsolute(clean)) {
      fail(`removedPaths entry is not a repo-relative path: ${entry}`);
    }
    if (expandHarnessPattern(repoRoot, ref, clean, record).length > 0) continue;
    const target = path.join(dir, clean);
    // lstat: a dangling symlink still counts as present and gets unlinked.
    try {
      lstatSync(target);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    // An ancestor symlinked outside dir would let rmSync delete outside the worktree.
    const root = realpathSync(dir);
    const parent = realpathSync(path.dirname(target));
    if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
      fail(`removedPaths entry resolves outside the worktree: ${entry}`);
    }
    rmSync(target, { recursive: true, force: true });
    removed.push(clean);
  }
  return removed;
}

/**
 * Copy harnessFiles from <ref> into dir, delete the files <ref> removed, and
 * merge the npmScripts keys of package.json.
 */
export function overlayHarness(repoRoot, dir, ref, { record } = {}) {
  writeFileSync(path.join(dir, OVERLAY_MARKER), `${ref}\n`);
  const harnessPaths = harnessPathsDoc(repoRoot, ref, record);
  const files = harnessFiles(repoRoot, ref, record);
  for (const file of files) {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, extractFile(repoRoot, ref, file, record));
  }
  const removedFiles = removeStaleHarnessFiles(
    repoRoot,
    dir,
    ref,
    harnessPaths.removedPaths ?? [],
    { record },
  );
  const refPkg = JSON.parse(git(repoRoot, ["show", `${ref}:package.json`], { record }));
  const dirPkgPath = path.join(dir, "package.json");
  const dirPkg = JSON.parse(readFileSync(dirPkgPath, "utf8"));
  // Scripts <ref> retired (e.g. loop:profile) must not survive from the base commit.
  for (const key of harnessPaths.removedNpmScripts ?? []) {
    if (refPkg.scripts?.[key] === undefined) delete dirPkg.scripts?.[key];
  }
  for (const key of harnessPaths.npmScripts ?? []) {
    if (refPkg.scripts?.[key] !== undefined) {
      dirPkg.scripts = dirPkg.scripts ?? {};
      dirPkg.scripts[key] = refPkg.scripts[key];
    }
  }
  writeFileSync(dirPkgPath, `${JSON.stringify(dirPkg, null, 2)}\n`);
  return {
    files,
    removedFiles,
    mergedScripts: HARNESS_PATHS.npmScripts.filter((k) => refPkg.scripts?.[k] !== undefined),
  };
}

/**
 * Task spec handed to the agent — oracle content is deliberately excluded (AC1).
 * Schema-strict (`.agent/schema/spec.schema.json`): no extra keys until #950
 * adds `prAllowed`; the no-push/no-PR rule is carried as a nonGoal meanwhile.
 */
export function buildAgentSpec(entry) {
  return {
    goal: entry.humanRequest,
    acceptanceCriteria: entry.acceptanceCriteria.map((text, index) => ({
      id: `ac${index + 1}`,
      text,
    })),
    nonGoals: [
      "oracleのテスト・採点内容は与えられない。仕様どおり実装し、通常の検証で確認する",
      "git履歴・object db・リモート取得でoracleや参照実装を探さない",
      "evalのためリモートpush・PR作成は行わない（REVIEW cleanで終了）",
    ],
    assumptions: [],
    openMaterialDecisions: [],
    verificationStrategy: ["REVIEW cleanまで通常どおり検証を実施する"],
    predictedRisk: entry.expectedMinTier,
  };
}

/* -------------------------------------------------------------- commands */

export function prepare(id, { dir, harness = "HEAD", specOut, record } = {}) {
  const entry = golden(id);
  const repoRoot = repoRootFor(record);
  const absDir = path.resolve(dir);
  if (existsSync(absDir)) fail(`prepare dir already exists: ${absDir}`);
  const ts = Date.now();
  const branch = `eval/${id}/${ts}`;
  const tmpBase = `eval-base/${id}/${ts}`;
  const srcDir = `${absDir}.eval-src`;

  // Isolation: clone --depth 1 so the eval repo's object db contains only the
  // base commit, then add <dir> as a linked worktree of that clone (required —
  // check-task-worktree rejects plain checkouts and the canonical dir).
  git(repoRoot, ["branch", tmpBase, entry.baseCommit], { record });
  let overlayHead;
  let overlayResult;
  try {
    try {
      execFileSync(
        "git",
        ["clone", "--depth", "1", "--no-tags", "--branch", tmpBase, `file://${repoRoot}`, srcDir],
        { encoding: "utf8" },
      );
      git(srcDir, ["worktree", "add", absDir, "-b", branch], { record });
    } catch (error) {
      // clone/worktree-add自体の失敗でも残骸を残さない
      rmSync(absDir, { recursive: true, force: true });
      rmSync(srcDir, { recursive: true, force: true });
      throw error;
    }
    try {
      git(absDir, ["remote", "remove", "origin"], { record });
      overlayResult = overlayHarness(repoRoot, absDir, harness, { record });
      run("pnpm", ["install", "--frozen-lockfile"], absDir);
      git(absDir, ["add", "-A"], { record });
      git(
        absDir,
        [
          "-c",
          "user.email=eval@local",
          "-c",
          "user.name=eval",
          "commit",
          "-m",
          `eval: overlay harness ${harness}`,
        ],
        { record },
      );
      overlayHead = git(absDir, ["rev-parse", "HEAD"], { record });
    } catch (error) {
      // Roll back so a failed prepare leaves nothing behind (f-5).
      try {
        git(srcDir, ["worktree", "remove", "--force", absDir], { record });
      } catch {
        rmSync(absDir, { recursive: true, force: true });
      }
      rmSync(srcDir, { recursive: true, force: true });
      throw error;
    }
  } finally {
    try {
      git(repoRoot, ["branch", "-D", tmpBase], { record });
    } catch {
      /* best effort */
    }
  }
  const specPath = specOut ?? `/tmp/eval-${id}-spec.json`;
  writeFileSync(specPath, `${JSON.stringify(buildAgentSpec(entry), null, 2)}\n`);
  return {
    id,
    dir: absDir,
    srcDir,
    branch,
    baseCommit: entry.baseCommit,
    harnessRef: harness,
    overlaidFiles: overlayResult.files.length,
    removedFiles: overlayResult.removedFiles,
    mergedScripts: overlayResult.mergedScripts,
    overlayCommit: overlayHead,
    spec: specPath,
    init: `node scripts/loop-runner.mjs --init ${specPath} --task ${id} --runtime <runtime> --implementer <session-id> --base ${overlayHead}`,
  };
}

function repoRootFor(record) {
  return record?.repoRoot ?? REPO_ROOT;
}

function oracleTestFiles(entry, dir, record) {
  for (const file of entry.oracle.tests ?? []) {
    const content = git(repoRootFor(record), ["show", `${entry.referenceCommit}:${file}`], {
      record,
    });
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${content}\n`);
  }
}

function runVitest(dir, files) {
  try {
    run("pnpm", ["exec", "vitest", "run", ...files], dir);
    return { pass: true, failedTests: [] };
  } catch {
    // Re-run per-file to attribute failures.
    const failedTests = [];
    for (const file of files) {
      try {
        run("pnpm", ["exec", "vitest", "run", file], dir);
      } catch {
        failedTests.push(file);
      }
    }
    return { pass: false, failedTests };
  }
}

function runDocsOracle(entry, dir) {
  const failedTests = [];
  for (const check of entry.oracle.requiredContent ?? []) {
    const target = path.join(dir, check.file);
    const body = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (!body.includes(check.contains)) failedTests.push(`${check.file}: ${check.contains}`);
  }
  if (entry.oracle.checkLoopDocs) {
    try {
      run("node", ["scripts/check-loop-docs.mjs"], dir);
    } catch {
      failedTests.push("check-loop-docs");
    }
  }
  return { pass: failedTests.length === 0, failedTests };
}

export function grade(id, { dir, out, record, expectFail = false } = {}) {
  const entry = golden(id);
  const absDir = path.resolve(dir);
  if (!existsSync(path.join(absDir, ".git"))) fail(`not a worktree: ${absDir}`);
  let result;
  if (entry.oracle.type === "docs") {
    result = runDocsOracle(entry, absDir);
  } else {
    oracleTestFiles(entry, absDir, record);
    result = runVitest(absDir, entry.oracle.tests);
  }
  const oracle = { pass: result.pass, failedTests: result.failedTests };
  const report = {
    taskId: id,
    oracle,
    ...(expectFail && result.pass ? { warning: "expected failure but oracle passed" } : {}),
  };
  if (out) {
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    appendFileSync(path.resolve(out), `${JSON.stringify(report)}\n`);
  }
  return report;
}

function loadJsonl(file) {
  const map = new Map();
  for (const line of readFileSync(path.resolve(file), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const key = parsed.taskId ?? parsed.id;
    if (key) map.set(key, { ...(map.get(key) ?? {}), ...parsed });
  }
  return map;
}

const pick = (summary, pathSpec) =>
  pathSpec.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), summary);

const UNMEASURED = "未計測";

/**
 * Sum the measured roles of a summary field. A role recorded as null was never
 * measured (Issue #985); when no role was measured the whole field is
 * UNMEASURED rather than 0, so it never yields a delta.
 */
function sumMeasured(summary, field, keys = null) {
  let total = 0;
  let measured = false;
  for (const role of ["implementer", "reviewer"]) {
    const value = pick(summary, `${field}.${role}`);
    if (value == null) continue;
    measured = true;
    total += keys ? keys.reduce((sum, key) => sum + (value[key] ?? 0), 0) : value;
  }
  return measured ? total : UNMEASURED;
}

/** Roles that carry a measurement; deltas are only comparable between equal sets. */
function measuredRoles(summary, field) {
  return ["implementer", "reviewer"]
    .filter((role) => pick(summary, `${field}.${role}`) != null)
    .join(",");
}

export function report({ baseline, candidate }) {
  const base = loadJsonl(baseline);
  const cand = loadJsonl(candidate);
  const ids = [...new Set([...base.keys(), ...cand.keys()])].sort();
  const metrics = [
    [
      "oracle",
      (s) => (s?.oracle?.pass === true ? "pass" : s?.oracle?.pass === false ? "fail" : "-"),
    ],
    ["tokens", (s) => sumMeasured(s, "tokens", ["input", "output", "cachedInput"]), "tokens"],
    ["modelCalls", (s) => sumMeasured(s, "modelCalls"), "modelCalls"],
    ["runnerCommands", (s) => s?.runnerCommands ?? "-"],
    ["wallTimeMs", (s) => s?.wallTimeMs ?? s?.durationMs ?? "-"],
    ["reviewRounds", (s) => s?.reviewRounds ?? "-"],
  ];
  const rows = ids.map((id) => {
    const row = { id };
    if (!base.has(id)) row.baseline = "欠損";
    if (!cand.has(id)) row.candidate = "欠損";
    for (const [name, get, usageField] of metrics) {
      const b = base.has(id) ? get(base.get(id)) : null;
      const c = cand.has(id) ? get(cand.get(id)) : null;
      row[name] = { baseline: b ?? "欠損", candidate: c ?? "欠損" };
      if (
        typeof b === "number" &&
        typeof c === "number" &&
        (!usageField ||
          measuredRoles(base.get(id), usageField) === measuredRoles(cand.get(id), usageField))
      ) {
        row[name].delta = c - b;
      }
    }
    return row;
  });
  const lines = ["id | metric | baseline | candidate | delta", "---|---|---|---|---"];
  for (const row of rows) {
    for (const [name] of metrics) {
      const cell = row[name];
      lines.push(
        `${row.id} | ${name} | ${cell.baseline} | ${cell.candidate} | ${cell.delta ?? "-"}`,
      );
    }
  }
  return { rows, table: lines.join("\n") };
}

export function cleanup(id, { dir, record } = {}) {
  const absDir = path.resolve(dir);
  const repoRoot = repoRootFor(record);
  const srcDir = `${absDir}.eval-src`;
  if (existsSync(absDir)) {
    if (existsSync(srcDir)) {
      // <dir> is a worktree of the eval-src clone, not of this repo.
      try {
        git(srcDir, ["worktree", "remove", "--force", absDir], { record });
      } catch {
        rmSync(absDir, { recursive: true, force: true });
      }
    } else {
      // Backward compatible: worktree of the canonical repo (pre-clone prepare).
      git(repoRoot, ["worktree", "remove", "--force", absDir], { record });
    }
  }
  rmSync(srcDir, { recursive: true, force: true });
  // Branch sweep is best-effort: `+`/` ` prefixes mark worktree-checked-out
  // branches; a branch still checked out elsewhere is skipped, not fatal.
  for (const branch of git(repoRoot, ["branch", "--list", `eval/${id}/*`], { record })
    .split("\n")
    .map((name) => name.trim().replace(/^[*+]\s*/, ""))
    .filter(Boolean)) {
    try {
      git(repoRoot, ["branch", "-D", branch], { record });
    } catch {
      /* checked out elsewhere — leave it */
    }
  }
  return { removed: absDir, removedSrc: srcDir };
}

/* ------------------------------------------------------------------- cli */

export function parseCli(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};
  const booleanOptions = new Set(["expect-fail"]);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (booleanOptions.has(key)) {
        options[key] = true;
        continue;
      }
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`${arg} requires a value`);
      options[key] = value;
      i += 1;
    } else positional.push(arg);
  }
  return { command, positional, options };
}

function cli(argv) {
  const { command, positional, options } = parseCli(argv);
  let out;
  if (command === "prepare") {
    const [id] = positional;
    if (!id || !options.dir)
      fail("usage: prepare <id> --dir <path> [--harness <ref>] [--spec-out <path>]");
    out = prepare(id, { dir: options.dir, harness: options.harness, specOut: options["spec-out"] });
  } else if (command === "grade") {
    const [id] = positional;
    if (!id || !options.dir) fail("usage: grade <id> --dir <path> [--out <file>] [--expect-fail]");
    out = grade(id, {
      dir: options.dir,
      out: options.out,
      expectFail: Boolean(options["expect-fail"]),
    });
  } else if (command === "report") {
    if (!options.baseline || !options.candidate)
      fail("usage: report --baseline <file> --candidate <file>");
    out = report({ baseline: options.baseline, candidate: options.candidate });
    console.log(out.table);
  } else if (command === "cleanup") {
    const [id] = positional;
    if (!id || !options.dir) fail("usage: cleanup <id> --dir <path>");
    out = cleanup(id, { dir: options.dir });
  } else {
    fail(`usage: harness-eval.mjs <prepare|grade|report|cleanup> …`);
  }
  console.log(JSON.stringify(out, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2));
}
