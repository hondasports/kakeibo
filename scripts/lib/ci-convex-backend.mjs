/**
 * 使い捨てbackendプロセスの起動・停止と、取得済みリソースの後始末を所有する。
 * `convex dev` をプロセスグループごと終了できる形で起動し、E2Eコマンドの子プロセス実行、
 * 反映待ち中のpush nudge、backend停止→checkout環境復元→専用config削除のcleanup契約を担う。
 */

import { spawn } from "node:child_process";
import { utimesSync } from "node:fs";
import { resolve } from "node:path";

import { resolveE2EPorts } from "./isolated-e2e-ports.ts";
import { restoreEnvLocal } from "./ci-convex-checkout-env.mjs";
import { convexBinPath, localConfigArgs, log, repoRoot } from "./ci-convex-env-boundary.mjs";

export function startBackend(env, { envFile, spawnImpl = spawn } = {}) {
  const ports = resolveE2EPorts(env);
  let logBuffer = "";
  const child = spawnImpl(
    process.execPath,
    [
      convexBinPath(),
      "dev",
      ...localConfigArgs(envFile),
      "--local-cloud-port",
      String(ports.convexCloud),
      "--local-site-port",
      String(ports.convexSite),
    ],
    {
      cwd: repoRoot,
      env,
      // プロセスグループごと終了できるようdetachedにする
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const onData = (chunk) => {
    logBuffer += chunk.toString();
    if (logBuffer.length > 512 * 1024) logBuffer = logBuffer.slice(-256 * 1024);
    process.stdout.write(chunk);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  return { child, getLog: () => logBuffer };
}

function stopBackend(child) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.killed) {
      resolvePromise();
      return;
    }
    const timer = setTimeout(() => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
      resolvePromise();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolvePromise();
    }
  });
}

export async function cleanupIsolatedBackend({
  backend,
  localConfig,
  restoreEnv = restoreEnvLocal,
  stopBackendImpl = stopBackend,
}) {
  try {
    if (backend) await stopBackendImpl(backend);
  } finally {
    try {
      if (restoreEnv()) log(".env.local を復元しました");
    } finally {
      localConfig.cleanup();
    }
  }
}

/**
 * `convex dev` が env vars 型のpush失敗後に張る deployment env watch の購読開始と
 * こちらの `convex env set` が前後した場合の取りこぼし対策。
 * fileSystemWatch が拾うよう、観測対象の `convex/auth.config.ts` のmtimeを更新する。
 */
export function startPushNudge({
  intervalMs = 5000,
  filePath = resolve(repoRoot, "convex/auth.config.ts"),
} = {}) {
  const timer = setInterval(() => {
    try {
      const now = new Date();
      utimesSync(filePath, now, now);
    } catch {
      /* 監視対象が無ければ何もしない */
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export function runChildCommand(command, extraArgs, env) {
  const fullCommand = extraArgs.length > 0 ? `${command} ${extraArgs.join(" ")}` : command;
  log(`実行: ${fullCommand}`);
  const child = spawn(fullCommand, [], {
    cwd: repoRoot,
    env,
    shell: true,
    stdio: "inherit",
  });
  return new Promise((resolvePromise) => {
    child.on("error", (error) => {
      console.error(`コマンドの起動に失敗しました: ${error.message}`);
      resolvePromise(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) resolvePromise(128);
      else resolvePromise(code ?? 1);
    });
  });
}
