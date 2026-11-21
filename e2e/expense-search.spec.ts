import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupE2eExpenseEntries } from "./helpers/cleanup";
import { saveExpense } from "./helpers/expenseEntry";
import { expectNoContentOverflow } from "./helpers/viewport";

test.describe("履歴検索（Issue #537 / #637〜#643）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/weeks/current/input");
    await cleanupE2eExpenseEntries({ page });
  });

  test.afterEach(async ({ page }) => {
    await cleanupE2eExpenseEntries({ page });
  });

  test("@smoke ヘッダー検索から店名で支出を見つけられる", async ({ page }) => {
    await saveExpense(page, "検索用スーパー北浜", "3210", { clearTimeout: 15_000 });

    await page.getByLabel("履歴を検索").fill("北浜");
    await page.getByRole("button", { name: "検索する" }).click();

    await expect(page).toHaveURL(/\/search\?q=/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "履歴検索", level: 1 })).toBeVisible();
    await expect(page.getByText("検索用スーパー北浜").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("3,210円").first()).toBeVisible();

    // Issue #1295: 狭いPC幅（900〜1199px）で年つき日付の一覧が枠からはみ出さないこと
    const expenseList = page.getByRole("table", { name: "支出の検索結果" });
    for (const width of [900, 1199]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(expenseList).toBeVisible();
      await expectNoContentOverflow(expenseList);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("@smoke 収入も履歴検索の結果と種別フィルタに含まれる", async ({ page }) => {
    await page.getByRole("tab", { name: "収入" }).click();
    await page.getByLabel("金額").fill("50000");
    await page.getByLabel("収入の内容・メモ").fill("検索用給与");
    await page.getByRole("button", { name: "保存して次へ" }).click();
    await expect(page.getByText("収入を保存しました")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("履歴を検索").fill("検索用給与");
    await page.getByRole("button", { name: "検索する" }).click();
    await expect(page.getByRole("heading", { name: "履歴検索", level: 1 })).toBeVisible();
    await expect(page.getByText("収入一覧（1件）")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("検索用給与").first()).toBeVisible();

    // Issue #1295: 狭いPC幅（900〜1199px）で年つき日付の収入一覧が枠からはみ出さないこと
    const incomeList = page.getByRole("table", { name: "収入の検索結果" });
    for (const width of [900, 1199]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(incomeList).toBeVisible();
      await expectNoContentOverflow(incomeList);
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    await page
      .getByRole("group", { name: "記録種別" })
      .getByRole("button", { name: "支出" })
      .click();
    await page.getByRole("button", { name: "絞り込む" }).click();
    await expect(page.getByText("条件に合う履歴はありません")).toBeVisible({ timeout: 15_000 });
  });
});
