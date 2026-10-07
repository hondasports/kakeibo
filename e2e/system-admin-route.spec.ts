import { expect, test } from "@playwright/test";
import { bypassClerkBotDetection } from "./helpers/auth";

test.describe("system admin route", () => {
  test("未認証の /admin 直アクセスは管理情報を表示しない", async ({ page }) => {
    await bypassClerkBotDetection(page);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "管理画面を利用できません" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("システム管理者として操作")).not.toBeVisible();
    await expect(page.getByText("家計データは表示されません")).not.toBeVisible();
    await expect(page.getByRole("link", { name: "通常の画面へ戻る" })).toHaveAttribute("href", "/");
  });
});
