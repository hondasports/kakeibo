#!/usr/bin/env node
/**
 * push前にCIと同じ検証を差分に応じて1コマンドで実行する（Issue #957）。
 *
 * 使い方:
 *   node scripts/verify-prepush.mjs [--include <path> ...] [--base <sha>]
 *
 * 検証順（先に失敗した時点で停止）:
 *   1. 型: tsc -b
 *   2. lint / format: pnpm run lint / pnpm run format:check
 *   3. unit: vitest related --run <変更ファイル> と --include のunitテスト
 *   4. process: pnpm run test:process（scripts/.agent/docs/agent-harness*変更時のみ）
 *   5. E2E: pnpm run e2e:isolated -- <select-e2e-specsの選定spec + --include>
 *
 * 全部成功した場合だけ `git rev-parse --git-path agent-prepush` 配下に
 * `<HEAD>.ok` の0バイトマーカーを書く（#949がready条件に使う）。
 * worktreeがdirtyの場合は検証を回すがマーカーは書かない。
 * 失敗した場合は同じHEADの既存マーカーを消す。
 *
 * これはマージ判定材料ではない（判定はCIのcheckが正本）。証跡・状態ブロック・
 * PR記載には使わない。
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { isProcessOnlyPath, normalizeChangedPath } from "./classify-e2e-relevance.mjs";
import { parseEnvFile } from "./sync-e2e-env.mjs";
import { selectSpecs } from "./select-e2e-specs.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_KEEP = 20;
const E2E_SPEC_PATTERN = /^e2e\/[^/]+\.spec\.ts$/;
const UNIT_TEST_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const PROCESS_TRIGGER = /^(?:scripts\/|\.agent\/|docs\/agent-harness|e2e\/spec-map\.json)/;
// start-ci-convex.mjs が必須とするe2e env。E2E_CLERK_USER_ID は --probe 以外で必須。
const E2E_ENV_VARS = [
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
  "E2E_CLERK_USER_ID",
];
const E2E_PORTS = [
  { port: 5173, label: "Vite dev (pnpm run devが起動している場合は停止する)" },
  { port: 3210, label: "Convex local backend (api)" },
  { port: 3211, label: "Convex local backend (http actions)" },
];

/* ------------------------------------------------------------------ git */

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: sanitizeHookEnv(),
  }).trim();
}

export function markerDir(root = repoRoot) {
  return git(root, ["rev-parse", "--path-format=absolute", "--git-path", "agent-prepush"]);
}

export function prepushMarkerPath(root, head) {
  return path.join(markerDir(root), `${head}.ok`);
}

export function hasPrepushMarker(root, head) {
  return existsSync(prepushMarkerPath(root, head));
}

function writeMarker(dir, head) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${head}.ok`), "");
  // prune: keep newest MARKER_KEEP markers by mtime
  readdirSync(dir)
    .filter((name) => name.endsWith(".ok"))
    .map((name) => ({ name, mtimeMs: statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(MARKER_KEEP)
    .forEach((m) => rmSync(path.join(dir, m.name), { force: true }));
}

function dropMarker(dir, head) {
  const file = path.join(dir, `${head}.ok`);
  if (existsSync(file)) rmSync(file, { force: true });
}

/* ------------------------------------------------------------- planning */

export function parseArguments(argv) {
  const result = { include: [], base: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--include") {
      const value = argv[++i];
      if (!value) throw new Error("--include にはファイルパスを指定してください");
      result.include.push(normalizeChangedPath(value));
    } else if (arg === "--base") {
      result.base = argv[++i];
    } else {
      throw new Error(`不明な引数: ${arg}`);
    }
  }
  return result;
}

export function classifyIncludes(
  includePaths,
  { exists = (p) => existsSync(path.join(repoRoot, p)) } = {},
) {
  const e2eSpecs = [];
  const unitTests = [];
  const missing = [];
  for (const include of includePaths) {
    if (path.isAbsolute(include) || include.startsWith("..")) {
      missing.push(`${include} (repo相対パスで指定してください)`);
    } else if (!exists(include)) {
      missing.push(include);
    } else if (E2E_SPEC_PATTERN.test(include)) {
      e2eSpecs.push(include);
    } else if (
      UNIT_TEST_PATTERN.test(include) &&
      !include.startsWith("e2e/") &&
      !include.includes(".integration.test.")
    ) {
      unitTests.push(include);
    } else {
      missing.push(`${include} (e2e specかunit testファイルではない)`);
    }
  }
  return { e2eSpecs, unitTests, missing };
}

/** unitのrelated対象: process suiteが面倒を見るパスと非コードを除いた変更ファイル。 */
export function unitRelatedTargets(
  changedFiles,
  { exists = (p) => existsSync(path.join(repoRoot, p)) } = {},
) {
  return changedFiles
    .map(normalizeChangedPath)
    .filter(
      (file) =>
        !isProcessOnlyPath(file) &&
        !file.startsWith("scripts/") &&
        !file.startsWith("e2e/") &&
        !file.endsWith(".md") &&
        !file.endsWith(".json") &&
        exists(file),
    );
}

export function needsProcessSuite(changedFiles) {
  return changedFiles.map(normalizeChangedPath).some((file) => PROCESS_TRIGGER.test(file));
}

/* -------------------------------------------------------------- preflight */

/** TCP connectが成功するならそのポートは使用中。IPv4/IPv6両方を見る。 */
export function portBusy(
  port,
  { hosts = ["127.0.0.1", "::1"], timeoutMs = 800, connect = net.connect } = {},
) {
  const probe = (host) =>
    new Promise((resolve) => {
      let socket;
      try {
        socket = connect({ port, host });
      } catch {
        resolve(false);
        return;
      }
      const done = (busy) => {
        socket.destroy();
        resolve(busy);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
      socket.setTimeout(timeoutMs, () => done(false));
    });
  return Promise.all(hosts.map(probe)).then((results) => results.some(Boolean));
}

/** e2e:isolated の事前条件を検査し、満たさない条件を列挙する。 */
export async function e2ePreflight({
  cwd = repoRoot,
  ports = E2E_PORTS,
  requiredEnv = E2E_ENV_VARS,
  checkPort = portBusy,
  chromiumPath = defaultChromiumPath,
  backendBinaryPresent = defaultBackendBinaryPresent,
  networkReachable = defaultNetworkReachable,
} = {}) {
  const failures = [];
  const backendReady = await backendBinaryPresent();
  if (!backendReady && !(await networkReachable())) {
    failures.push(
      "Convex local backendバイナリ未取得でダウンロードも不可（ネットワーク到達なし）。先に `pnpm run e2e:isolated -- --probe` で取得するかネットワークを確認",
    );
  }
  for (const { port, label } of ports) {
    if (await checkPort(port, {})) {
      failures.push(`ポート ${port} が使用中（${label}）`);
    }
  }
  const envLocalPath = path.join(cwd, ".env.local");
  const fileEnv = existsSync(envLocalPath)
    ? parseEnvFile(readFileSync(envLocalPath, "utf8"))
    : new Map();
  // start-ci-convex.mjs と同じく process.env 優先、.env.local はフォールバック
  const missing = requiredEnv.filter((key) => !process.env[key] && !fileEnv.get(key));
  if (missing.length > 0) {
    failures.push(
      `E2E環境変数が不足: ${missing.join(", ")}（process.env または .env.local に設定。docs/environment-variables.md を参照）`,
    );
  }
  const chromium = chromiumPath();
  if (!chromium || !existsSync(chromium)) {
    failures.push(
      "Playwright Chromium 未インストール。`pnpm exec playwright install chromium` を実行",
    );
  }
  return failures;
}

function defaultBackendBinaryPresent() {
  // convex CLIは local backend バイナリを <cacheDir>/convex/binaries/<version>/
  // へ取得する（convex/dist/cli/lib/localDeployment/filePaths.js 準拠）。
  // ~/.convex はstate dirでありバイナリの有無とは無関係なので、実ファイルを見る。
  const cacheRoot =
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA ??
            path.join(process.env.USERPROFILE ?? os.homedir(), "AppData", "Local"),
          "convex",
        )
      : path.join(os.homedir(), ".cache", "convex");
  const binariesDir = path.join(cacheRoot, "binaries");
  try {
    const binary = `convex-local-backend${process.platform === "win32" ? ".exe" : ""}`;
    return Promise.resolve(
      readdirSync(binariesDir).some((ver) => existsSync(path.join(binariesDir, ver, binary))),
    );
  } catch {
    return Promise.resolve(false);
  }
}

function defaultNetworkReachable() {
  return new Promise((resolve) => {
    const socket = net.connect({ port: 443, host: "github.com" });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(2000, () => done(false));
  });
}

function defaultChromiumPath() {
  try {
    const require = createRequire(import.meta.url);
    const { chromium } = require("@playwright/test");
    return chromium.executablePath();
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- runner */

const LOG_DIR = path.join(os.tmpdir(), `suzumemo-prepush-${Date.now()}`);

// gitがhookへ注入する環境変数。pre-push経由で起動された場合、子プロセス
// （test fixture内のgit等）が別repoを指して壊れるため除去する。
const HOOK_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_QUARANTINE_PATH",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
];

export function sanitizeHookEnv(env = process.env) {
  const clean = { ...env };
  for (const key of HOOK_ENV_VARS) delete clean[key];
  return clean;
}

function defaultRunStep(command, args, cwd, logFile) {
  // e2e:isolated はconvexログを全部流すので既定の1MBでは溢れる
  const out = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: sanitizeHookEnv(),
    maxBuffer: 256 * 1024 * 1024,
  });
  writeFileSync(logFile, [out.stdout, out.stderr].filter(Boolean).join("\n"));
  return out.status ?? 1;
}

function gitStatusDirty(root) {
  return git(root, ["status", "--porcelain"]).length > 0;
}

function buildSteps({ changedFiles, selection, includes }) {
  const steps = [
    {
      id: "typecheck",
      label: "型 (tsc -b)",
      command: "pnpm",
      args: ["exec", "tsc", "-b"],
      rerun: "pnpm exec tsc -b",
    },
    {
      id: "lint",
      label: "lint (pnpm run lint)",
      command: "pnpm",
      args: ["run", "lint"],
      rerun: "pnpm run lint",
    },
    {
      id: "format",
      label: "format (pnpm run format:check)",
      command: "pnpm",
      args: ["run", "format:check"],
      rerun: "pnpm run format:check",
    },
  ];
  const related = unitRelatedTargets(changedFiles);
  if (related.length > 0) {
    steps.push({
      id: "unit-related",
      label: `unit (vitest related, ${related.length} files)`,
      command: "pnpm",
      args: ["exec", "vitest", "related", "--run", "--passWithNoTests", ...related],
      rerun: `pnpm exec vitest related --run --passWithNoTests ${related.join(" ")}`,
    });
  }
  if (includes.unitTests.length > 0) {
    steps.push({
      id: "unit-include",
      label: `unit (--include, ${includes.unitTests.length} files)`,
      command: "pnpm",
      args: ["exec", "vitest", "run", "--passWithNoTests", ...includes.unitTests],
      rerun: `pnpm exec vitest run --passWithNoTests ${includes.unitTests.join(" ")}`,
    });
  }
  if (needsProcessSuite(changedFiles)) {
    steps.push({
      id: "process",
      label: "process (pnpm run test:process)",
      command: "pnpm",
      args: ["run", "test:process"],
      rerun: "pnpm run test:process",
    });
  }
  if (selection.specs.length > 0) {
    steps.push({
      id: "e2e",
      label: `e2e (e2e:isolated, ${selection.specs.length} specs)`,
      command: "pnpm",
      args: ["run", "e2e:isolated", "--", ...selection.specs],
      rerun: `pnpm run e2e:isolated -- ${selection.specs.join(" ")}`,
    });
  }
  return steps;
}

/**
 * verify:prepushの実行本体。テストでは runStep / gitOps / preflight を注入して
 * 実コマンドを走らせず分岐だけ検証する。
 */
export async function runPrepush({
  argv = [],
  cwd = repoRoot,
  runStep = defaultRunStep,
  gitOps = {
    head: (root) => git(root, ["rev-parse", "HEAD"]),
    base: (root) => {
      // origin/preview が無い環境（shallow clone・オフライン等）でも落ちない
      for (const ref of ["origin/preview", "preview", "origin/main", "main"]) {
        try {
          return git(root, ["merge-base", "HEAD", ref]);
        } catch {
          // 次の候補へ
        }
      }
      return null;
    },
    changedFiles: (root, base, head) => {
      // baseが取れない場合は差分範囲を最終コミット（HEAD~1...head）に縮小する。
      // 未コミットの作業ツリー変更は含まれない点に注意（呼び出し側で警告する）。
      const range =
        base ??
        (() => {
          try {
            return git(root, ["rev-parse", "HEAD~1"]);
          } catch {
            return null;
          }
        })();
      if (!range) return [];
      return git(root, [
        "--no-pager",
        "diff",
        "--name-only",
        "--no-renames",
        // D除外: 削除されたファイルは検証対象にしない（select側でも存在確認する）
        "--diff-filter=ACMRTUXB",
        `${range}...${head}`,
      ])
        .split("\n")
        .filter(Boolean);
    },
    dirty: gitStatusDirty,
  },
  changedFilesOverride = null,
  preflight = e2ePreflight,
  markerBaseDir = (root) => markerDir(root),
  out = console.log,
} = {}) {
  const args = parseArguments(argv);
  const head = gitOps.head(cwd);
  const base = args.base ?? gitOps.base(cwd);
  if (!base) {
    out(
      "警告: base refが解決できないため差分範囲を最終コミット（HEAD~1...HEAD）に縮小します。未コミットの作業ツリー変更は検証対象に含まれません。",
    );
  }
  const changedFiles = changedFilesOverride ?? gitOps.changedFiles(cwd, base, head);
  const includes = classifyIncludes(args.include, {
    exists: (p) => existsSync(path.join(cwd, p)),
  });
  if (includes.missing.length > 0) {
    dropMarker(markerBaseDir(cwd), head);
    out(
      `verify:prepush FAILED\n--include のファイルが見つかりません:\n  ${includes.missing.join("\n  ")}`,
    );
    return 1;
  }
  const selection = selectSpecs({
    changedFiles,
    includeSpecs: includes.e2eSpecs,
    cwd,
  });
  const steps = buildSteps({ changedFiles, selection, includes });
  // unmappedはE2E実行前に必ず出す（step失敗時にも情報が残るように）
  if (selection.unmapped.length > 0) {
    out(
      `注意: spec-mapにないパスが ${selection.unmapped.length} 件（安全側で@smoke+@publicを選定）。mapへ追記してください:\n  ${selection.unmapped.join("\n  ")}`,
    );
  }
  if (selection.specs.length > 0) {
    const failures = await preflight({ cwd });
    if (failures.length > 0) {
      dropMarker(markerBaseDir(cwd), head);
      out(
        `verify:prepush FAILED\nE2E事前条件を満たしていません:\n${failures.map((f) => `  - ${f}`).join("\n")}\n迂回が必要な場合は git push --no-verify を使い、PR本文に記載してください。`,
      );
      return 1;
    }
  }
  const dirty = gitOps.dirty(cwd);
  mkdirSync(LOG_DIR, { recursive: true });
  let passed = 0;
  for (const step of steps) {
    const logFile = path.join(LOG_DIR, `${step.id}.log`);
    const started = Date.now();
    const status = runStep(step.command, step.args, cwd, logFile);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (status !== 0) {
      dropMarker(markerBaseDir(cwd), head);
      out(
        `✗ ${step.label} (${seconds}s)\nverify:prepush FAILED\nstep: ${step.id}\n再実行: ${step.rerun}\nlog: ${logFile}`,
      );
      return 1;
    }
    passed += 1;
    out(`✓ ${step.label} (${seconds}s)`);
  }
  if (dirty) {
    // dirty下での成功はHEADと検証対象が一致しないので、同じHEADの古い
    // マーカーも信用できない → 書かないだけでなく落とす（失敗と同じ扱い）
    dropMarker(markerBaseDir(cwd), head);
    out("worktreeがdirtyのため成功マーカーは書きません（HEADとマーカー内容を一致させるため）");
  } else {
    writeMarker(markerBaseDir(cwd), head);
  }
  out(`verify:prepush PASS (${passed} steps)`);
  return 0;
}

function main() {
  runPrepush({ argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`verify:prepush FAILED\n${error.message}`);
      process.exit(1);
    });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
