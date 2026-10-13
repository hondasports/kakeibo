import { expect, test, type Locator } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import { cleanupAiExpenseQueue, cleanupTestReceipts } from "./helpers/cleanup";
import { seedTaxReviewDraftByUser } from "./helpers/seed";

async function expectResolved(dialog: Locator) {
  await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("確認推奨 0件");
  await expect(dialog.getByRole("button", { name: "税内訳を修正" })).toHaveCount(0);
  await expect(dialog.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveCount(0);
  await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
}

for (const width of [1280, 320]) {
  test.describe(`Issue #1015 旧形式の税内訳 ${width}px`, () => {
    test.afterEach(async () => {
      await cleanupTestReceipts();
      await cleanupAiExpenseQueue();
    });
    for (const receiptCase of [
      "summary892",
      "summary892_unknown",
      "summary892_tax52",
      "summary892_conflict10",
      "summary892_conflictBoth",
    ] as const) {
      test(`${receiptCase} 確認済み商品から保存・再表示・登録で1782円を維持する`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await gotoAuthenticated(page, "/weeks/current/input");
        await cleanupAiExpenseQueue();
        await seedTaxReviewDraftByUser(await getCurrentClerkTokenIdentifier(page), receiptCase);
        await page.reload();
        const queue = page.locator(".input-workbench--expense");
        const item = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E税内訳補完店" });
        await expect(item).not.toContainText("金額・税内訳の確認が必要");
        await item.getByRole("button", { name: "確認する", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "下書き確認" });
        await expectResolved(dialog);
        const products = dialog.getByRole("region", { name: "商品一覧" });
        const bounds = await products.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        await dialog.getByText("読み取り原文（参考）", { exact: true }).click();
        await expect(dialog.getByRole("list", { name: "OCR原文" })).toContainText("合計 1,782円");
        await dialog.screenshot({ path: testInfo.outputPath("legacy-tax-derived.png") });
        await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
        await expect(dialog).toBeHidden();
        const ready = queue
          .getByRole("region", { name: "登録できます" })
          .locator(".ai-expense-queue-item")
          .filter({ hasText: "E2E税内訳補完店" });
        await expect(ready).toContainText("1,782円");
        await ready.getByRole("button", { name: "修正する", exact: true }).click();
        await expectResolved(dialog);
        await expect(dialog.getByLabel("合計金額", { exact: true })).toHaveValue("1782");
        await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
        await expect(dialog).toBeHidden();
        await ready.getByRole("button", { name: "登録する", exact: true }).click();
        await expect(queue.getByRole("region", { name: "登録済み" })).toContainText("1,782円");
      });
    }
  });
}
