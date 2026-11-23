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

  test("@smoke 検索条件が最近の検索に残り、保存してリロード後も1タップで再適用できる", async ({
    page,
  }) => {
    const savedName = "E2E保存検索";
    await saveExpense(page, "保存検索用スーパー東町", "4321", { clearTimeout: 15_000 });

    await page.goto("/search");
    await page.getByLabel("キーワード").fill("保存検索用");
    await page.getByRole("button", { name: "絞り込む", exact: true }).click();
    await expect(page).toHaveURL(/\/search\?q=/, { timeout: 10_000 });
    await expect(page.getByText("保存検索用スーパー東町").first()).toBeVisible({ timeout: 15_000 });

    // 検索ボタンで適用した条件が、要約として最近の検索に残る
    const recentList = page.getByRole("list", { name: "最近の検索" });
    await expect(recentList).toContainText("キーワード: 保存検索用", { timeout: 10_000 });

    try {
      await page.getByRole("button", { name: "この条件を保存" }).click();
      const dialog = page.getByRole("dialog", { name: "検索条件を保存" });
      await dialog.getByLabel("名前").fill(savedName);
      await dialog.getByRole("button", { name: "保存する" }).click();
      const savedList = page.getByRole("list", { name: "保存した検索" });
      await expect(savedList).toContainText(savedName, { timeout: 10_000 });

      // リロードして条件を外し、保存した検索から再適用すると同じ条件の結果に戻る
      await page.goto("/search");
      await expect(page.getByLabel("キーワード")).toHaveValue("");
      await page
        .getByRole("list", { name: "保存した検索" })
        .getByRole("button", { name: new RegExp(`^${savedName}(?!を)`) })
        .click();
      await expect(page).toHaveURL(/\/search\?q=/, { timeout: 10_000 });
      await expect(page.getByLabel("キーワード")).toHaveValue("保存検索用");
      await expect(page.getByText("保存検索用スーパー東町").first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      // 保存済みの上限（20件）を圧迫しないよう、このテストで作った保存条件を消す
      await page.goto("/search");
      const deleteButton = page.getByRole("button", {
        name: `${savedName}を保存した検索から削除`,
      });
      for (let remaining = await deleteButton.count(); remaining > 0; remaining -= 1) {
        await deleteButton.first().click();
        await expect(deleteButton).toHaveCount(remaining - 1, { timeout: 10_000 });
      }
    }
  });
});
