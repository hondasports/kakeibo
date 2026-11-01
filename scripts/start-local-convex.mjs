#!/usr/bin/env node
/**
 * ローカル開発用のConvex watcherを起動する。
 *
 * シェルの短絡評価に依存せず、local deploymentの選択・初回作成と
 * `convex dev` の常駐を同じNodeプロセスから管理することで、Windowsでも
 * Viteを含む開発プロセスが途中で切れないようにする。
 */

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureConvexNodeRuntime,
  envWithConvexNodeRuntime,
} from "./ensure-convex-node-runtime.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const convexBin = resolve(dirname(require.resolve("convex/package.json")), "bin", "main.js");

// local backend の node executor は v20/22/24 の `node` を要求するため、
// ツールチェーンが Node 26+ のときは executor 用ランタイムを子プロセスにだけ見せる
const convexNodeRuntime = await ensureConvexNodeRuntime();
const childEnv = envWithConvexNodeRuntime(process.env, convexNodeRuntime);

function runConvex(args) {
  return spawnSync(process.execPath, [convexBin, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: childEnv,
  });
}

const selected = runConvex(["deployment", "select", "local"]);
if (selected.status !== 0) {
  const created = runConvex(["deployment", "create", "local", "--select"]);
  if (created.status !== 0) {
    process.exit(created.status ?? 1);
  }
}

const watcher = spawn(process.execPath, [convexBin, "dev", ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: "inherit",
  env: childEnv,
});

watcher.on("error", (error) => {
  console.error(`Convex watcherの起動に失敗しました: ${error.message}`);
  process.exitCode = 1;
});

watcher.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
