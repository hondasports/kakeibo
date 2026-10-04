import { expect, test } from "@playwright/test";
import { gotoAuthenticated, getCurrentClerkTokenIdentifier } from "./helpers/auth";
import { seedTaxReviewDraftByUser } from "./helpers/seed";
import { cleanupAiExpenseQueueByUser, cleanupE2eExpenseEntriesByUser } from "./helpers/cleanup";

for (const receipt of [
  { receiptCase: "basis890", paidYen: 436, taxYen: 32, amounts: ["98", "138", "168"] },
  { receiptCase: "basis890_264", paidYen: 264, taxYen: 19, amounts: ["109", "78", "58"] },
] as const) {
  test(`@smoke #890 税抜補正・再保存・登録で税込${receipt.paidYen}円と印字税額を維持する`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoAuthenticated(page, "/weeks/current/input");
    const userId = await getCurrentClerkTokenIdentifier(page);
    await cleanupAiExpenseQueueByUser(userId);
    await cleanupE2eExpenseEntriesByUser(userId);
    try {
      await seedTaxReviewDraftByUser(userId, receipt.receiptCase);
      await page.reload();
      const row = page
        .locator(".ai-expense-queue-item")
        .filter({ hasText: `E2E税基準確認店${receipt.paidYen}` });
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
      for (const [index, amount] of receipt.amounts.entries()) {
        const name = `商品${index + 1}`;
        const detail = dialog.locator("details").filter({ hasText: name }).first();
        if ((await detail.getAttribute("open")) === null) await detail.locator("summary").click();
        await expect(
          detail.getByRole("combobox", { name: name + "の表示価格", exact: true }),
        ).toHaveText("税抜");
        await expect(detail.getByLabel("レシートの金額", { exact: true })).toHaveValue(amount);
      }
      const reference = dialog
        .locator("details")
        .filter({ hasText: "読み取り原文・詳しい税情報（参考）" })
        .first();
      if ((await reference.getAttribute("open")) === null)
        await reference.locator("summary").click();
      const taxSummary = reference.locator('[aria-label="税率別集計"]');
      await expect(taxSummary).toContainText(`対象額 ${receipt.paidYen}円（税込）`);
      await expect(taxSummary).toContainText(`税額 ${receipt.taxYen}円`);
      await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
      await expect(dialog).toBeHidden();
      await row.getByRole("button", { name: "修正する", exact: true }).click();
      await expect(matched).toBeVisible();
      if ((await reference.getAttribute("open")) === null)
        await reference.locator("summary").click();
      await expect(taxSummary).toContainText(`対象額 ${receipt.paidYen}円（税込）`);
      await expect(taxSummary).toContainText(`税額 ${receipt.taxYen}円`);
      await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
      await expect(dialog).toBeHidden();
      await row.getByRole("button", { name: "登録する", exact: true }).click();
      await expect(row).toContainText("登録済み", { timeout: 20_000 });
      await expect(row).toContainText(`${receipt.paidYen}円`);
    } finally {
      await cleanupAiExpenseQueueByUser(userId);
      await cleanupE2eExpenseEntriesByUser(userId);
    }
  });
}
