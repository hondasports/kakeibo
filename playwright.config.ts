import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { vercelBypassStatePath } from "./scripts/lib/vercel-protection";
import { hasCustomE2EPorts, resolveE2EPorts } from "./scripts/lib/isolated-e2e-ports";

const projectRoot = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(projectRoot, ".env.local") });
const localPorts = resolveE2EPorts();
const isolated = process.env.E2E_ISOLATED === "true";
const explicitLocalPorts = isolated || hasCustomE2EPorts();
const remoteBaseURL = isolated ? undefined : process.env.E2E_BASE_URL;
const localBaseURL = `http://localhost:${localPorts.vite}`;

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

/**
 * E2E テスト設定
 * Clerk 認証セットアップ手順: docs/development-process.md「Codex 開発時の Clerk 認証」
 */
export default defineConfig({
  testDir: "./e2e",
  /* 全テストの最大タイムアウト（API 遅延対応） */
  timeout: 60_000,
  /* expect() のタイムアウト */
  expect: {
    timeout: 10_000,
  },
  /* flaky テストの自動リトライは local/CI ともに 1 回に統一（#958） */
  retries: 1,
  /* 単一のClerkテストユーザーを使うため、認証・cleanup競合を避けて常に直列実行する */
  workers: 1,
  /* 失敗時のみスクリーンショット・trace を保存（認証情報が含まれる可能性があるため短期保持） */
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    /* flaky(passed-on-retry)の機械抽出用。CI summaryと --check-pr が読む */
    ["json", { outputFile: "e2e-results/results.json" }],
  ],
  use: {
    /* isolated以外でE2E_BASE_URLが設定されていればVercel Previewを対象にする */
    baseURL: remoteBaseURL ?? localBaseURL,
    /* 失敗時のみスクリーンショット保存 */
    screenshot: "only-on-failure",
    /* 失敗時のみ trace 保存 */
    trace: "on-first-retry",
    /*
     * storageState は Vercel protection のホスト限定cookieだけに使う。
     * @clerk/testing/playwright の認証は storageState ではなく
     * setupClerkTestingToken({ page }) による Testing Token 方式を使う。
     * 認証が必要な各テスト／beforeEach で setupClerkTestingToken を呼ぶこと。
     */
    /*
     * Vercel Protection Bypass for Automation cookie
     * GitHub Actions から PLAYWRIGHT_BYPASS_SECRET が渡された場合のみ有効になる。
     * ローカル実行時は undefined になるため影響なし。
     * 詳細: docs/development-process.md「E2E 確認方針」
     */
    storageState: process.env.PLAYWRIGHT_BYPASS_SECRET ? vercelBypassStatePath : undefined,
  },
  projects: [
    {
      // global setup: Clerk Testing Token を取得して process.env に設定
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  /* ローカル実行時は vite dev サーバーを自動起動 */
  webServer: remoteBaseURL
    ? undefined
    : {
        command: explicitLocalPorts
          ? `pnpm run dev:frontend --port ${localPorts.vite} --strictPort`
          : process.env.CI
            ? "pnpm run dev:frontend"
            : "pnpm run dev",
        url: localBaseURL,
        reuseExistingServer: explicitLocalPorts ? false : !process.env.CI,
        timeout: 60_000,
      },
});
