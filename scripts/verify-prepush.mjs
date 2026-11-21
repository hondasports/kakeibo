#!/usr/bin/env node
/**
 * push前の検証を差分に応じて1コマンドで実行する（Issue #957 / #1333）。
 * E2EはCIへ集約済みのため実行しない（任意実行は `pnpm run e2e:isolated -- <spec>`）。
 *
 * 使い方:
 *   node scripts/verify-prepush.mjs [--include <path> ...] [--base <sha>]
 *
 * 検証順（先に失敗した時点で停止）:
 *   1. 型: tsc -b
 *   2. lint / format: pnpm run lint / pnpm run format:check
 *   3. unit: vitest related --run <変更ファイル + unit-related-map.json で引いたfs依存テスト> と --include のunitテスト
 *
 * これはマージ判定材料ではない（判定はCIのcheckが正本）。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMetadataOnlyPath, normalizeChangedPath } from "./classify-e2e-relevance.mjs";
import { loadUnitRelatedMap, unitMappedTests } from "./unit-related-map.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E2E_SPEC_PATTERN = /^e2e\/[^/]+\.spec\.ts$/;
const UNIT_TEST_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/* ------------------------------------------------------------------ git */

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: sanitizeHookEnv(),
  }).trim();
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
  const unitTests = [];
  const missing = [];
  for (const include of includePaths) {
    if (path.isAbsolute(include) || include.startsWith("..")) {
      missing.push(`${include} (repo相対パスで指定してください)`);
    } else if (!exists(include)) {
      missing.push(include);
    } else if (E2E_SPEC_PATTERN.test(include)) {
      missing.push(
        `${include} (E2Eはpre-pushで実行しない。任意実行は pnpm run e2e:isolated -- ${include})`,
      );
    } else if (
      UNIT_TEST_PATTERN.test(include) &&
      !include.startsWith("e2e/") &&
      !include.includes(".integration.test.")
    ) {
      unitTests.push(include);
    } else {
      missing.push(`${include} (unit testファイルではない)`);
    }
  }
  return { unitTests, missing };
}

/** unitのrelated対象: メタデータ・非コード・E2Eを除いた変更ファイル。 */
export function unitRelatedTargets(
  changedFiles,
  { exists = (p) => existsSync(path.join(repoRoot, p)) } = {},
) {
  return changedFiles
    .map(normalizeChangedPath)
    .filter(
      (file) =>
        !isMetadataOnlyPath(file) &&
        !file.startsWith("e2e/") &&
        !file.endsWith(".md") &&
        !file.endsWith(".json") &&
        exists(file),
    );
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

function defaultRunStep(command, args, cwd, logFile, env) {
  // 既定の1MBに戻さない: 出力が超えると子プロセスが止められ、検証の失敗と区別できなくなる
  const out = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 256 * 1024 * 1024,
  });
  writeFileSync(logFile, [out.stdout, out.stderr].filter(Boolean).join("\n"));
  return out.status ?? 1;
}

function buildSteps({ changedFiles, includes, cwd = repoRoot, unitMap = {} }) {
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
  const exists = (p) => existsSync(path.join(cwd, p));
  const related = unitRelatedTargets(changedFiles, { exists });
  // importグラフに乗らないfs依存はmap経由でテスト自身をrelated対象に加える
  const mapped = unitMappedTests(changedFiles, unitMap).filter(exists);
  const unitTargets = [...new Set([...related, ...mapped])];
  if (unitTargets.length > 0) {
    steps.push({
      id: "unit-related",
      label: `unit (vitest related, ${unitTargets.length} files)`,
      command: "pnpm",
      args: ["exec", "vitest", "related", "--run", "--passWithNoTests", ...unitTargets],
      rerun: `pnpm exec vitest related --run --passWithNoTests ${unitTargets.join(" ")}`,
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
  return steps;
}

/**
 * verify:prepushの実行本体。テストでは runStep / gitOps / preflight を注入して
 * 実コマンドを走らせず分岐だけ検証する。
 */
export async function runPrepush({
  argv = [],
  cwd = repoRoot,
  env = process.env,
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
  },
  changedFilesOverride = null,
  out = console.log,
} = {}) {
  const args = parseArguments(argv);
  const stepEnv = sanitizeHookEnv(env);
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
    out(
      `verify:prepush FAILED\n--include のファイルが見つかりません:\n  ${includes.missing.join("\n  ")}`,
    );
    return 1;
  }
  const steps = buildSteps({
    changedFiles,
    includes,
    cwd,
    unitMap: loadUnitRelatedMap(cwd),
  });
  mkdirSync(LOG_DIR, { recursive: true });
  let passed = 0;
  for (const step of steps) {
    const logFile = path.join(LOG_DIR, `${step.id}.log`);
    const started = Date.now();
    const status = runStep(step.command, step.args, cwd, logFile, stepEnv);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (status !== 0) {
      out(
        `✗ ${step.label} (${seconds}s)\nverify:prepush FAILED\nstep: ${step.id}\n再実行: ${step.rerun}\nlog: ${logFile}`,
      );
      return 1;
    }
    passed += 1;
    out(`✓ ${step.label} (${seconds}s)`);
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
