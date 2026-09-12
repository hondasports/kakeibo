import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { clickUserMenuItem } from "./helpers/ui";

/**
 * 認証フロー E2E テスト
 *
 * カバーするシナリオ:
 *   - シナリオ 1: 未ログイン状態でアクセス → ログイン画面が表示される (P0)
 *     ※ Clerk Testing Token 方式と構造的に非互換のためスキップ
 *     ※ global-setup の clerkSetup() が CLERK_TESTING_TOKEN を process.env にセットするため、
 *     ※ storageState を空にしても Testing Token がリクエストに付与され Clerk の初期化が不安定になる。
 *   - シナリオ 4: ログアウト → ログイン画面に戻る (P1)
 */

/**
 * ログアウトテスト
 * gotoAuthenticated でログイン状態を作り、ログアウト後の状態を確認する。
 */
test.describe("ログアウト", () => {
  test("@smoke シナリオ4: ログアウトするとログイン画面に戻る", async ({ page }) => {
    await gotoAuthenticated(page);
    await expect(page.locator("text=今週のダッシュボード")).toBeVisible();

    // ユーザーメニューを開いてログアウト
    await clickUserMenuItem(page, "ログアウト");

    // ログイン画面に戻ることを確認
    await expect(page.getByAltText("Suzumemo スズメモ")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  });
});
