import { expect, test, type Locator } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import { cleanupAiExpenseQueue, cleanupTestReceipts } from "./helpers/cleanup";
import { seedTaxReviewDraftByUser } from "./helpers/seed";

async function expectResolved(dialog: Locator) {
  await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("確認推奨 0件");
  await expect(dialog.getByRole("button", { name: "税内訳を修正" })).toHaveCount(0);
  await expect(dialog.getByLabel("税率別集計", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "税内訳を確認" })).toHaveCount(0);
}

for (const width of [1280, 320]) {
  test.describe(`Issue #892 税内訳表示 ${width}px`, () => {
    test.afterEach(async () => {
      await cleanupTestReceipts();
      await cleanupAiExpenseQueue();
    });

    for (const receiptCase of [
      "summary892",
      "summary892_conflict10",
      "summary892_conflictBoth",
    ] as const) {
      test(`${receiptCase} 修正・保存・再表示・登録で1782円を維持する`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await gotoAuthenticated(page, "/weeks/current/input");
        const queue = page.locator(".input-workbench--expense");
        await expect(queue).toBeVisible();
        await cleanupAiExpenseQueue();
        const userId = await getCurrentClerkTokenIdentifier(page);
        await seedTaxReviewDraftByUser(userId, receiptCase);
        await page.reload();
        const item = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E税内訳補完店" });
        await item.getByRole("button", { name: "確認する", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "下書き確認" });
        const banner = dialog.getByRole("region", { name: "全体の確認状態" });
        if (receiptCase !== "summary892") {
          const expectedForms = receiptCase === "summary892_conflictBoth" ? 2 : 1;
          await expect(banner.getByRole("button", { name: "税内訳を修正" })).toHaveCount(
            expectedForms,
          );
          const rate = receiptCase === "summary892_conflictBoth" ? 8 : 10;
          await banner
            .locator("li")
            .filter({ hasText: `${rate}%の税内訳：` })
            .getByRole("button", { name: "税内訳を修正" })
            .click();
          const editor = dialog.getByRole("region", { name: `${rate}%の税内訳を修正` });
          await expect(editor.getByRole("combobox", { name: "税率", exact: true })).toBeFocused();
          await expect(editor).toBeInViewport();
          const bounds = await editor.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
          await expect(dialog.getByRole("button", { name: "保存", exact: true })).toHaveCount(
            expectedForms,
          );
          if (receiptCase === "summary892_conflict10")
            await expect(dialog.getByRole("region", { name: "8%の税内訳を修正" })).toHaveCount(0);
          await dialog.screenshot({ path: testInfo.outputPath("tax-summary-before.png") });
          if (receiptCase === "summary892_conflictBoth") {
            await editor.getByRole("spinbutton", { name: "対象額" }).fill("669");
            await editor.getByRole("button", { name: "保存", exact: true }).click();
            await expect(editor).toHaveCount(0);
            await expect(banner.getByRole("button", { name: "税内訳を修正" })).toHaveCount(1);
            await banner.getByRole("button", { name: "税内訳を修正" }).click();
          }
          const tenPercentEditor = dialog.getByRole("region", { name: "10%の税内訳を修正" });
          await expect(
            tenPercentEditor.getByRole("combobox", { name: "税率", exact: true }),
          ).toBeFocused();
          await tenPercentEditor.getByRole("combobox", { name: "対象額種別" }).click();
          await page.getByRole("option", { name: "税込印字", exact: true }).click();
          await tenPercentEditor.getByRole("button", { name: "保存", exact: true }).click();
          await expectResolved(dialog);
        } else {
          await dialog.getByText("読み取り原文・詳しい税情報（参考）", { exact: true }).click();
          await expectResolved(dialog);
        }
        await expect(dialog.getByRole("list", { name: "OCR原文" })).toContainText("合計 1,782円");
        await dialog.screenshot({ path: testInfo.outputPath("tax-summary-resolved.png") });
        await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
        await expect(dialog).toBeHidden();
        const ready = queue
          .getByRole("region", { name: "登録できます" })
          .locator(".ai-expense-queue-item")
          .filter({ hasText: "E2E税内訳補完店" });
        await expect(ready).toContainText("1,782円");
        await ready.getByRole("button", { name: "修正する", exact: true }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByText("読み取り原文・詳しい税情報（参考）", { exact: true }).click();
        await expectResolved(dialog);
        await expect(dialog.getByLabel("合計金額", { exact: true })).toHaveValue("1782");
        await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
        await expect(dialog).toBeHidden();
        await ready.getByRole("button", { name: "登録する", exact: true }).click();
        const registered = queue
          .getByRole("region", { name: "登録済み" })
          .locator(".ai-expense-queue-item")
          .filter({ hasText: "E2E税内訳補完店" });
        await expect(registered).toContainText("1,782円");
      });
    }
  });
}
