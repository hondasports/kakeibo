import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupE2eExpenseEntries } from "./helpers/cleanup";
import { saveExpense } from "./helpers/expenseEntry";

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
  });

  test("金額条件で0件なら空メッセージを表示する", async ({ page }) => {
    await saveExpense(page, "金額フィルタ店", "1500", { clearTimeout: 15_000 });

    await page.getByLabel("履歴を検索").fill("金額フィルタ店");
    await page.getByRole("button", { name: "検索する" }).click();
    await expect(page.getByRole("heading", { name: "履歴検索", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "支出（1グループ）" })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/search?q=${encodeURIComponent("金額フィルタ店")}&min=9000`);
    await expect(page.getByText("条件に合う履歴はありません")).toBeVisible({ timeout: 10_000 });
  });

  test("収入も履歴検索の結果と種別フィルタに含まれる", async ({ page }) => {
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

    await page
      .getByRole("group", { name: "記録種別" })
      .getByRole("button", { name: "支出" })
      .click();
    await page.getByRole("button", { name: "絞り込む" }).click();
    await expect(page.getByText("条件に合う履歴はありません")).toBeVisible({ timeout: 15_000 });
  });

  test("SP幅でもヘッダー検索窓が見える", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("履歴を検索")).toBeVisible();
  });
});
