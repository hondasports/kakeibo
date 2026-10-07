#!/usr/bin/env node
/**
 * PR専用の使い捨てConvex backend（anonymous local deployment）を起動し、
 * E2Eコマンドを実行してからbackendを確実に終了する。
 *
 * CIの `e2e.yml` とローカルの `pnpm run e2e:isolated` の両方から同じ構成を
 * 実行するための入口。共有cloud devには一切接続しない。
 *
 * 使い方:
 *   node scripts/start-ci-convex.mjs --probe                    # backend起動と疎通だけ確認
 *   node scripts/start-ci-convex.mjs --run "<command>" [-- args] # 準備後にコマンド実行
 *   node scripts/start-ci-convex.mjs                            # 起動したまま待機（Ctrl+Cで終了）
 *
 * 仕組み:
 *   1. cloud向け環境変数を取り除いた子環境で `CONVEX_AGENT_MODE=anonymous` の
 *      `convex dev` を起動する（ログイン不要の使い捨てlocal deployment）。
 *   2. CLIが `.env.local` へ local URL を書き出すのを待つ。既存の `.env.local`
 *      は起動前に `.env.local.e2e-isolated.bak` へ退避し、終了時に復元する。
 *   3. `convex env set` で E2E 用の環境変数を deployment へ設定する。
 *      `convex/auth.config.ts` が参照する CLERK_JWT_ISSUER_DOMAIN 等が無いと
 *      初回pushは失敗するが、watchモードの `convex dev` は env vars 型の失敗後に
 *      deployment の環境変数変更を購読して自動で再pushするため、先に env set
 *      してから反映完了（"Convex functions ready"）を待つ。取りこぼし対策として
 *      待機中は `convex/auth.config.ts` のmtimeを定期的に更新して再pushを促す。
 *   4. `POST /e2e/cleanup-auth-check` が 200 を返すまで待機して準備完了とする。
 *   5. --run の場合はコマンドを子プロセスで実行し、終了コードをそのまま返す。
 *      終了時（正常・異常・シグナル）は必ずbackendのプロセスグループを終了する。
 *
 * CIでは VITE_CONVEX_URL / VITE_CONVEX_SITE_URL / E2E_CLEANUP_SECRET を
 * `$GITHUB_ENV` に書き出す（E2E_CLEANUP_SECRETは `::add-mask::` でマスク済み）。
 */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { parseEnvFile, deriveClerkJwtIssuerDomain } from "./sync-e2e-env.mjs";
import { ensureLineIntegrationMode } from "./ensure-line-integration-mode.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = resolve(repoRoot, ".env.local");
const envBackupPath = resolve(repoRoot, ".env.local.e2e-isolated.bak");
const READY_MARKER = "Convex functions ready";
const DEFAULT_TIMEOUT_MS = 120_000;
const ENV_FILE_TIMEOUT_MS = 60_000;
const BACKEND_ENV_DENYLIST = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "VITE_CONVEX_URL",
  "VITE_CONVEX_SITE_URL",
];

function convexBinPath() {
  const require = createRequire(import.meta.url);
  return resolve(dirname(require.resolve("convex/package.json")), "bin", "main.js");
}

/**
 * `convex dev` や `convex env` に渡す環境を作る。
 * cloud deploymentを指す環境変数を外し、anonymous modeを強制する。
 * これが無いと端末のCONVEX_DEPLOYMENTに引きずられてcloudへ接続しに行く。
 */
export function backendEnv(base = process.env) {
  const env = { ...base };
  for (const name of BACKEND_ENV_DENYLIST) env[name] = undefined;
  env.CONVEX_AGENT_MODE = "anonymous";
  return env;
}

export function parseArgs(argv) {
  const result = { run: null, probe: false, timeoutSec: DEFAULT_TIMEOUT_MS / 1000, extraArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run") {
      result.run = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--probe") {
      result.probe = true;
    } else if (arg === "--timeout") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--timeout には正の秒数を指定してください");
      }
      result.timeoutSec = value;
      i += 1;
    } else if (arg === "--") {
      result.extraArgs = argv.slice(i + 1);
      break;
    } else if (arg.startsWith("--")) {
      throw new Error(`不明な引数: ${arg}`);
    } else {
      // `pnpm run e2e:isolated -- e2e/foo.spec.ts` の末尾位置引数は --run のコマンドへ連結する
      result.extraArgs.push(arg);
    }
  }
  return result;
}

export function generateCleanupSecret() {
  return randomBytes(32).toString("hex");
}

export function redact(text, secrets) {
  return secrets.reduce(
    (acc, value) => (value ? acc.split(value).join("[REDACTED]") : acc),
    String(text ?? ""),
  );
}

function log(message) {
  process.stdout.write(`[isolated-convex] ${message}\n`);
}

function maskForCI(value) {
  if (process.env.GITHUB_ACTIONS === "true" && value) {
    process.stdout.write(`::add-mask::${value}\n`);
  }
}

/**
 * 既存の `.env.local` をバックアップとして退避する。
 * anonymous deploymentは `.env.local` を書き換えるため、ユーザーの
 * 通常開発用の接続先を終了時に復元できるようにする。
 * 前回異常終了で `.bak` が残っていた場合は先に復元する。
 */
export function backupEnvLocal({ envPath = envLocalPath, backupPath = envBackupPath } = {}) {
  if (existsSync(backupPath) && !existsSync(envPath)) {
    renameSync(backupPath, envPath);
  }
  if (existsSync(envPath)) {
    copyFileSync(envPath, backupPath);
    rmSync(envPath);
    return true;
  }
  return false;
}

export function restoreEnvLocal({ envPath = envLocalPath, backupPath = envBackupPath } = {}) {
  if (existsSync(backupPath)) {
    if (existsSync(envPath)) rmSync(envPath);
    renameSync(backupPath, envPath);
    return true;
  }
  // .env.local が新規作成されただけなら削除して元の「無い」状態に戻す
  if (existsSync(envPath)) rmSync(envPath);
  return false;
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * `.env.local` に anonymous local deployment のURLが書き込まれるまで待つ。
 */
export async function waitForLocalEnvFile({
  envPath = envLocalPath,
  timeoutMs = ENV_FILE_TIMEOUT_MS,
  intervalMs = 500,
  now = Date.now,
} = {}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (existsSync(envPath)) {
      const env = parseEnvFile(readFileSync(envPath, "utf8"));
      const url = env.get("VITE_CONVEX_URL");
      const siteUrl = env.get("VITE_CONVEX_SITE_URL");
      if (url && siteUrl && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url)) {
        return { url, siteUrl, env };
      }
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `convex dev が .env.local に local deployment の URL を書き込みませんでした（${timeoutMs / 1000}秒タイムアウト）`,
  );
}

/**
 * backendのログに関数反映完了マーカーが出るまで待つ。
 */
export async function waitForFunctionsReady({
  getLog,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = 500,
  now = Date.now,
  marker = READY_MARKER,
} = {}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (getLog().includes(marker)) return;
    await sleep(intervalMs);
  }
  throw new Error(`convex dev の関数反映が完了しませんでした（${timeoutMs / 1000}秒タイムアウト）`);
}

/**
 * `POST /e2e/cleanup-auth-check` が200を返すまで待つ。
 * HTTP actionの反映と E2E_CLEANUP_SECRET の適用を同時に検証できる。
 */
export async function waitForCleanupAuth({
  siteUrl,
  secret,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = 1000,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const deadline = now() + timeoutMs;
  let lastError = "未実行";
  while (now() < deadline) {
    try {
      const res = await fetchImpl(`${siteUrl}/e2e/cleanup-auth-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-E2E-Cleanup-Secret": secret },
        body: "{}",
      });
      if (res.status === 200) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `e2e/cleanup-auth-check が200を返しませんでした（${timeoutMs / 1000}秒タイムアウト。最終状態: ${lastError}）`,
  );
}

function runConvexCli(args, env) {
  const result = spawnSync(process.execPath, [convexBinPath(), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

async function setConvexEnv(env, name, value, secrets, { attempts = 5 } = {}) {
  let lastDetail = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = runConvexCli(["env", "set", name, value], env);
    if (result.status === 0) return;
    lastDetail = redact(`${result.stdout}\n${result.stderr}`, secrets).trim();
    // `.convex/local/default` のcredential書き込みと `convex env` の解決が
    // 微妙にずれる起動直後だけ再試行する（spawnSyncなので Atomics.wait で待つ）
    if (attempt < attempts) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error(`convex env set ${name} に失敗しました。${lastDetail ? ` (${lastDetail})` : ""}`);
}

async function applyConvexEnv({ env, secrets, clerkIssuerDomain }) {
  const secret = generateCleanupSecret();
  const allSecrets = [...secrets, secret];
  // auth.config.ts が参照する env が無いとpush自体が失敗するため最優先で設定する
  if (clerkIssuerDomain) {
    await setConvexEnv(env, "CLERK_JWT_ISSUER_DOMAIN", clerkIssuerDomain, allSecrets);
  }
  await setConvexEnv(env, "APP_ENV", "development", allSecrets);
  await setConvexEnv(env, "RECEIPT_IMAGE_EXTRACTOR_MODE", "mock", allSecrets);
  if (process.env.E2E_CLERK_USER_ID) {
    await setConvexEnv(env, "E2E_CLERK_USER_ID", process.env.E2E_CLERK_USER_ID, allSecrets);
  }
  // 招待系actionが Clerk API を呼ぶ経路のため、利用可能なら同期する（throwaway backendのみ）
  if (process.env.CLERK_SECRET_KEY) {
    await setConvexEnv(env, "CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY, allSecrets);
  }
  await setConvexEnv(env, "E2E_CLEANUP_SECRET", secret, allSecrets);
  ensureLineIntegrationMode({
    runConvexEnv: (args) => runConvexCli(args, env),
    log,
  });
  return secret;
}

/**
 * `convex dev` が env vars 型のpush失敗後に張る deployment env watch の購読開始と
 * こちらの `convex env set` が前後した場合の取りこぼし対策。
 * fileSystemWatch が拾うよう、観測対象の `convex/auth.config.ts` のmtimeを更新する。
 */
function startPushNudge({
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

export function buildChildEnv(base, { url, siteUrl, cleanupSecret }) {
  const env = {
    ...base,
    // CIモードにして playwright の webServer が vite のみ（dev:frontend）を
    // 起動するようにし、sync-e2e-env の .env.local 同期を止める。
    CI: "true",
    VITE_CONVEX_URL: url,
    VITE_CONVEX_SITE_URL: siteUrl,
    E2E_CLEANUP_SECRET: cleanupSecret,
  };
  // CIでは CLERK_PUBLISHABLE_KEY だけが来るので Vite 側が読む名前へ写す
  if (!env.VITE_CLERK_PUBLISHABLE_KEY && env.CLERK_PUBLISHABLE_KEY) {
    env.VITE_CLERK_PUBLISHABLE_KEY = env.CLERK_PUBLISHABLE_KEY;
  }
  return env;
}

function resolveClerkIssuer() {
  const key = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    log("CLERK_PUBLISHABLE_KEY 未設定のため CLERK_JWT_ISSUER_DOMAIN は設定しません");
    return null;
  }
  return deriveClerkJwtIssuerDomain(key);
}

function appendGithubEnv(envValues) {
  const githubEnvPath = process.env.GITHUB_ENV;
  if (!githubEnvPath) return;
  const lines = Object.entries(envValues)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  appendFileSync(githubEnvPath, `${lines}\n`, { encoding: "utf8" });
}

function startBackend(env) {
  let logBuffer = "";
  const child = spawn(process.execPath, [convexBinPath(), "dev"], {
    cwd: repoRoot,
    env,
    // プロセスグループごと終了できるようdetachedにする
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
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

function runChildCommand(command, extraArgs, env) {
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = args.timeoutSec * 1000;
  const env = backendEnv();

  const hadBackup = backupEnvLocal();
  if (hadBackup) log("既存の .env.local を退避しました（終了時に復元）");

  const { child: backend, getLog } = startBackend(env);
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await stopBackend(backend);
    if (restoreEnvLocal()) log(".env.local を復元しました");
  };

  const onSignal = async (signal) => {
    await cleanup();
    process.kill(process.pid, signal);
  };
  process.on("SIGINT", () => void onSignal("SIGINT"));
  process.on("SIGTERM", () => void onSignal("SIGTERM"));

  try {
    const startedAt = Date.now();
    const { url, siteUrl } = await waitForLocalEnvFile({ timeoutMs: ENV_FILE_TIMEOUT_MS });

    // push前に deployment の環境変数を設定する。auth.config.ts が参照する
    // CLERK_JWT_ISSUER_DOMAIN が無い初回pushは失敗するが、`convex dev` は
    // env vars 型の失敗後に deployment env の変更を購読して自動再pushする。
    const clerkIssuer = resolveClerkIssuer();
    const secretValues = [
      process.env.CLERK_SECRET_KEY,
      process.env.E2E_CLERK_USER_PASSWORD,
      process.env.E2E_CLERK_USER_ID,
    ];
    const cleanupSecret = await applyConvexEnv({
      env,
      secrets: secretValues,
      clerkIssuerDomain: clerkIssuer,
    });
    maskForCI(cleanupSecret);

    const stopNudge = startPushNudge();
    try {
      await waitForFunctionsReady({ getLog, timeoutMs });
    } finally {
      stopNudge();
    }
    log(`backend 準備完了（${Math.round((Date.now() - startedAt) / 1000)}秒）`);

    await waitForCleanupAuth({ siteUrl, secret: cleanupSecret, timeoutMs });
    log("e2e/cleanup-auth-check 疎通 OK");

    appendGithubEnv({
      VITE_CONVEX_URL: url,
      VITE_CONVEX_SITE_URL: siteUrl,
      E2E_CLEANUP_SECRET: cleanupSecret,
    });

    if (args.probe) {
      log("--probe: backend の起動と疎通を確認しました");
      await cleanup();
      return;
    }

    if (args.run) {
      const childEnv = buildChildEnv(process.env, { url, siteUrl, cleanupSecret });
      const code = await runChildCommand(args.run, args.extraArgs, childEnv);
      await cleanup();
      process.exitCode = code;
      return;
    }

    log("backend を起動したまま待機中（Ctrl+C で終了）");
    // シグナルで終了するまで待機
    await new Promise(() => {});
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await cleanup();
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
