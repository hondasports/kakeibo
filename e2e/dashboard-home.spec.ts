import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";

test.describe("ホーム画面拡充（Issue #370）", () => {
  test("@smoke [Issue #370] PC幅でサマリー指標と前週比較が表示される", async ({ page }) => {
    await gotoAuthenticated(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await expect(page.getByRole("heading", { name: "今週のダッシュボード" })).toBeVisible();
    await expect(page.getByText("今週の支出")).toBeVisible();
    await expect(page.getByText("入力済み", { exact: true })).toBeVisible();
    await expect(page.getByLabel("前週比").first()).toBeVisible();
    await expect(page.getByLabel("前週比").first()).toContainText(/%|前週データなし/);
    await expect(page.getByRole("heading", { name: "前週との比較", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "支出カテゴリ", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "今週の入力", level: 2 })).toBeVisible();
    await expect(page.locator(".dashboard-grid")).toBeVisible();
    await expect(page.getByRole("link", { name: "今週のサマリーを見る ›" })).toBeVisible();
  });

  test("@smoke [Issue #370] SP幅で入力パネルがカテゴリより上に表示される", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAuthenticated(page);

    const inputPanel = page.locator(".dashboard-input-panel--compact");
    const categoryHeading = page.getByRole("heading", { name: "支出カテゴリ", level: 2 });

    await expect(inputPanel).toBeVisible();
    await expect(
      inputPanel.getByRole("link", {
        name: /支出・収入を入力する|入力を再開|今週のサマリーを見る/,
      }),
    ).toBeVisible();
    await expect(categoryHeading).toBeVisible();

    const inputBeforeCategory = await page.evaluate(() => {
      const panel = document.querySelector(".dashboard-input-panel--compact");
      const category = Array.from(document.querySelectorAll("h2")).find(
        (heading) => heading.textContent === "支出カテゴリ",
      );
      if (!panel || !category) {
        return false;
      }
      return (panel.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(inputBeforeCategory).toBe(true);
  });

  test("@smoke [Issue #370] SP幅で今週のサマリー導線が下部に表示される", async ({ page }) => {
    await gotoAuthenticated(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(page.getByRole("link", { name: "今週のサマリーを見る" })).toBeVisible();
  });
});
