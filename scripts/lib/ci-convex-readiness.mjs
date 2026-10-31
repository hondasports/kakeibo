/**
 * backendの準備完了を観測する待機処理を所有する。
 * `.env.local` への local URL 書き込み、関数反映マーカー、cleanup-auth HTTP疎通を
 * 固定sleepではなく観測条件が満たされるまでポーリングして待つ。
 */

import { existsSync, readFileSync } from "node:fs";

import { parseEnvFile } from "../sync-e2e-env.mjs";
import { envLocalPath } from "./ci-convex-checkout-env.mjs";

const READY_MARKER = "Convex functions ready";
export const DEFAULT_TIMEOUT_MS = 120_000;
export const ENV_FILE_TIMEOUT_MS = 60_000;

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
  ports,
} = {}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (existsSync(envPath)) {
      const env = parseEnvFile(readFileSync(envPath, "utf8"));
      const url = env.get("VITE_CONVEX_URL");
      const siteUrl = env.get("VITE_CONVEX_SITE_URL");
      if (
        isLoopbackUrl(url) &&
        isLoopbackUrl(siteUrl) &&
        (!ports || (urlPort(url) === ports.convexCloud && urlPort(siteUrl) === ports.convexSite))
      ) {
        return { url, siteUrl, env };
      }
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `convex dev が .env.local に local deployment の URL を書き込みませんでした（${timeoutMs / 1000}秒タイムアウト）`,
  );
}

function urlPort(value) {
  const url = new URL(value);
  return Number(url.port || "80");
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
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
  acceptAnyResponse = false,
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
      if (res.status === 200) return res.status;
      // probe では「HTTP action が応答した」こと自体が疎通の証明になる。
      // 401/503 はデプロイ済み関数が実行された応答なのでそこで終了する。
      if (acceptAnyResponse) return res.status;
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
