import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { verifyCleanupAuth } from "./helpers/cleanup";
import { prepareVercelBypassState } from "../scripts/lib/vercel-protection";

/**
 * Playwright グローバルセットアップ
 *
 * clerkSetup() を呼び出して CLERK_FAPI と CLERK_TESTING_TOKEN を process.env に設定する。
 * これにより各テストで setupClerkTestingToken({ page }) が Clerk のボット検出をバイパスできる。
 *
 * ※ storageState（user.json）は作成しない。認証は Testing Token 方式で行う。
 *
 * 必要な環境変数（.env.local または GitHub Secrets）:
 *   CLERK_PUBLISHABLE_KEY=pk_test_...  ← VITE_CLERK_PUBLISHABLE_KEY と同じ値
 *   CLERK_SECRET_KEY=sk_test_...
 *
 * 詳細: docs/development-process.md「Codex 開発時の Clerk 認証」
 */

// Setup は serial で実行（並列実行による競合を防ぐ）
setup.describe.configure({ mode: "serial" });

setup("global setup", async () => {
  if (process.env.PLAYWRIGHT_BYPASS_SECRET) {
    if (!process.env.E2E_BASE_URL) {
      throw new Error("E2E_BASE_URL is required for Vercel protection setup.");
    }
    await prepareVercelBypassState(process.env.E2E_BASE_URL, process.env.PLAYWRIGHT_BYPASS_SECRET);
  }
  if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  }
  await clerkSetup();
  await verifyCleanupAuth();
});
