import { expect, test } from "@playwright/test";
import { gotoAuthenticated, getCurrentClerkTokenIdentifier } from "./helpers/auth";
import { seedTaxReviewDraftByUser } from "./helpers/seed";
import { cleanupAiExpenseQueueByUser } from "./helpers/cleanup";

test("@smoke #890 税抜補正・保存・再表示・登録で税込436円を維持する", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoAuthenticated(page, "/weeks/current/input");
  const userId = await getCurrentClerkTokenIdentifier(page);
  await cleanupAiExpenseQueueByUser(userId);
  try {
    await seedTaxReviewDraftByUser(userId, "basis890");
    await page.reload();
    const row = page.locator(".ai-expense-queue-item").filter({ hasText: "E2E税基準確認店" });
    await row.getByRole("button", { name: "確認する", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    for (const name of ["商品1", "商品2", "商品3"]) {
      const detail = dialog.locator("details").filter({ hasText: name }).first();
      if ((await detail.getAttribute("open")) === null) await detail.locator("summary").click();
      await detail.getByRole("combobox", { name: name + "の表示価格", exact: true }).click();
      await page.getByRole("option", { name: "税抜", exact: true }).click();
    }
    const matched = dialog
      .getByRole("region", { name: "全体の確認状態" })
      .getByText("印字額と明細の金額が一致しています");
    await expect(matched).toBeVisible();
    await expect(dialog.getByText("比較不能", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await row.getByRole("button", { name: "修正する", exact: true }).click();
    await expect(matched).toBeVisible();
    for (const [name, amount] of [
      ["商品1", "98"],
      ["商品2", "138"],
      ["商品3", "168"],
    ]) {
      const detail = dialog.locator("details").filter({ hasText: name }).first();
      if ((await detail.getAttribute("open")) === null) await detail.locator("summary").click();
      await expect(
        detail.getByRole("combobox", { name: name + "の表示価格", exact: true }),
      ).toHaveText("税抜");
      await expect(detail.getByLabel("レシートの金額", { exact: true })).toHaveValue(amount);
    }
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await row.getByRole("button", { name: "登録する", exact: true }).click();
    await expect(row).toContainText("登録済み", { timeout: 20_000 });
    await expect(row).toContainText("436円");
  } finally {
    await cleanupAiExpenseQueueByUser(userId);
  }
});
