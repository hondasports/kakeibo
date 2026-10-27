import { expect, test } from "@playwright/test";
import { bypassClerkBotDetection } from "./helpers/auth";

// @smoke を付けない: 同じガードを notifications.spec.ts の @smoke で確認しているため。
test.describe("system admin route", () => {
  test("未認証の /admin 直アクセスは管理情報を表示しない", async ({ page }) => {
    await bypassClerkBotDetection(page);
    await page.goto("/admin");

    // Appの未認証ゲートが管理画面のrouterより先にログイン画面を表示する。
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("システム管理者として操作")).not.toBeVisible();
    await expect(page.getByText("家計データは表示されません")).not.toBeVisible();
    await expect(page.getByAltText("Suzumemo スズメモ")).toBeVisible();
  });
});
