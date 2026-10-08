import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const projectRoot = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(projectRoot, ".env.local") });

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
  /* 単一のClerkテストユーザーと共有Dev DBを使うため、cleanup競合を避けて常に直列実行する */
  workers: 1,
  /* 失敗時のみスクリーンショット・trace を保存（認証情報が含まれる可能性があるため短期保持） */
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    /* flaky(passed-on-retry)の機械抽出用。CI summaryと --check-pr が読む */
    ["json", { outputFile: "e2e-results/results.json" }],
  ],
  use: {
    /* テスト対象 URL。環境変数 E2E_BASE_URL が設定されていれば Vercel Preview を対象にする */
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    /* 失敗時のみスクリーンショット保存 */
    screenshot: "only-on-failure",
    /* 失敗時のみ trace 保存 */
    trace: "on-first-retry",
    /*
     * storageState はここでは設定しない。
     * @clerk/testing/playwright の認証は storageState ではなく
     * setupClerkTestingToken({ page }) による Testing Token 方式を使う。
     * 認証が必要な各テスト／beforeEach で setupClerkTestingToken を呼ぶこと。
     */
    /*
     * Vercel Protection Bypass for Automation ヘッダー
     * GitHub Actions から PLAYWRIGHT_BYPASS_SECRET が渡された場合のみ有効になる。
     * ローカル実行時は undefined になるため影響なし。
     * 詳細: docs/development-process.md「E2E 確認方針」
     */
    extraHTTPHeaders: process.env.PLAYWRIGHT_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.PLAYWRIGHT_BYPASS_SECRET }
      : undefined,
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
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "pnpm run dev:frontend" : "pnpm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
