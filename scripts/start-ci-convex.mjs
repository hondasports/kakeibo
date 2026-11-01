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
 *   ポート指定: E2E_VITE_PORT / E2E_CONVEX_CLOUD_PORT / E2E_CONVEX_SITE_PORT
 *
 * 仕組み:
 *   1. cloud向け環境変数を取り除き、匿名localを指定する専用 `--env-file` で
 *      `convex dev` を起動する（checkoutの `.env` / `.env.local` は選択に使わない）。
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
 * このファイルはCLIの進行管理だけを持つ。責務ごとの実装は `scripts/lib/` へ分離:
 *   - ci-convex-env-boundary.mjs: 環境境界・専用local config・Convex CLI/env write・
 *     子プロセスenv・secretのredact・CI出力
 *   - ci-convex-checkout-env.mjs: checkoutの `.env.local` の退避・復元
 *   - ci-convex-backend.mjs: backendプロセスの起動・停止・push nudge・cleanup契約
 *   - ci-convex-readiness.mjs: `.env.local`・関数反映・cleanup-auth の待機
 *
 * CIでは VITE_CONVEX_URL / VITE_CONVEX_SITE_URL / E2E_CLEANUP_SECRET を
 * `$GITHUB_ENV` に書き出す（E2E_CLEANUP_SECRETは `::add-mask::` でマスク済み）。
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureConvexNodeRuntime,
  envWithConvexNodeRuntime,
} from "./ensure-convex-node-runtime.mjs";
import { resolveE2EPorts } from "./lib/isolated-e2e-ports.ts";
import {
  appendGithubEnv,
  applyConvexEnv,
  backendEnv,
  buildChildEnv,
  createLocalDeploymentConfig,
  log,
  maskForCI,
  resolveClerkIssuer,
} from "./lib/ci-convex-env-boundary.mjs";
import { backupEnvLocal, readBackedUpEnv, restoreEnvLocal } from "./lib/ci-convex-checkout-env.mjs";
import {
  cleanupIsolatedBackend,
  runChildCommand,
  startBackend,
  startPushNudge,
} from "./lib/ci-convex-backend.mjs";
import {
  DEFAULT_TIMEOUT_MS,
  ENV_FILE_TIMEOUT_MS,
  waitForCleanupAuth,
  waitForFunctionsReady,
  waitForLocalEnvFile,
} from "./lib/ci-convex-readiness.mjs";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = args.timeoutSec * 1000;
  const env = backendEnv();
  // local backend の node executor は v20/22/24 の `node` を要求するため、
  // ツールチェーンが Node 26+ のときは executor 用ランタイムを backend 側だけに見せる
  const convexNodeRuntime = await ensureConvexNodeRuntime({ log });
  const backendSpawnEnv = envWithConvexNodeRuntime(env, convexNodeRuntime);
  const ports = resolveE2EPorts(env);
  const localConfig = createLocalDeploymentConfig();
  let backend;
  let envPrepared = false;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await cleanupIsolatedBackend({
      backend,
      localConfig,
      restoreEnv: () => envPrepared && restoreEnvLocal(),
    });
  };

  const onSignal = async (signal) => {
    await cleanup();
    process.kill(process.pid, signal);
  };
  process.on("SIGINT", () => void onSignal("SIGINT"));
  process.on("SIGTERM", () => void onSignal("SIGTERM"));

  try {
    const hadBackup = backupEnvLocal();
    envPrepared = true;
    if (hadBackup) log("既存の .env.local を退避しました（終了時に復元）");
    const started = startBackend(backendSpawnEnv, { envFile: localConfig.envFile });
    backend = started.child;
    const { getLog } = started;
    const startedAt = Date.now();
    const {
      url,
      siteUrl,
      env: localEnv,
    } = await waitForLocalEnvFile({ timeoutMs: ENV_FILE_TIMEOUT_MS, ports });
    localConfig.bind(localEnv);

    // 退避済み .env.local を env 未設定時のfallbackにする（ローカル `e2e:isolated` 用）
    const fallbackEnv = readBackedUpEnv();
    const e2eClerkUserId = process.env.E2E_CLERK_USER_ID ?? fallbackEnv?.get("E2E_CLERK_USER_ID");
    const clerkSecretKey = process.env.CLERK_SECRET_KEY ?? fallbackEnv?.get("CLERK_SECRET_KEY");
    if (!args.probe && !e2eClerkUserId) {
      throw new Error(
        "E2E_CLERK_USER_ID が未設定です。CIでは resolve-e2e-clerk-user-id.mjs を先行実行し、" +
          "ローカルでは .env.local に E2E_CLERK_USER_ID を入れてください。",
      );
    }

    // 関数反映完了を待つ前に deployment の環境変数を設定する。auth.config.ts が参照する
    // CLERK_JWT_ISSUER_DOMAIN が無い初回pushは失敗するが、`convex dev` は
    // env vars 型の失敗後に deployment env の変更を購読して自動再pushする。
    const clerkIssuer = resolveClerkIssuer(fallbackEnv);
    const secretValues = [clerkSecretKey, process.env.E2E_CLERK_USER_PASSWORD, e2eClerkUserId];
    const cleanupSecret = await applyConvexEnv({
      env,
      envFile: localConfig.envFile,
      secrets: secretValues,
      clerkIssuerDomain: clerkIssuer,
      e2eClerkUserId,
      clerkSecretKey,
    });
    maskForCI(cleanupSecret);

    const stopNudge = startPushNudge();
    try {
      await waitForFunctionsReady({ getLog, timeoutMs });
    } finally {
      stopNudge();
    }
    log(`backend 準備完了（${Math.round((Date.now() - startedAt) / 1000)}秒）`);

    const authStatus = await waitForCleanupAuth({
      siteUrl,
      secret: cleanupSecret,
      timeoutMs,
      acceptAnyResponse: args.probe,
    });
    if (authStatus === 200) {
      log("e2e/cleanup-auth-check 疎通 OK");
    } else {
      log(
        `e2e/cleanup-auth-check は HTTP ${authStatus}（action疎通を確認。deployment env が不足している可能性）`,
      );
    }

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
      const childEnv = buildChildEnv(process.env, {
        url,
        siteUrl,
        cleanupSecret,
        fallbackEnv,
      });
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
