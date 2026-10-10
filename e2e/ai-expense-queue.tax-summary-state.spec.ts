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
      "summary892_unknown",
      "summary892_tax52",
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
        // 一覧の確認理由は、下書き確認と同じ判定に揃える（#997）。
        // 解決済みなら古い金額・税内訳の理由を出さず、未解決なら隠さない。
        if (receiptCase === "summary892") {
          await expect(item).not.toContainText("金額・税内訳の確認が必要");
          await expect(item).toContainText("内容確認が必要");
        } else {
          await expect(item).toContainText("金額・税内訳の確認が必要");
        }
        await item.getByRole("button", { name: "確認する", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "下書き確認" });
        const banner = dialog.getByRole("region", { name: "全体の確認状態" });
        if (receiptCase !== "summary892") {
          const expectedForms = receiptCase === "summary892_conflictBoth" ? 2 : 1;
          await expect(banner.getByRole("button", { name: "税内訳を修正" })).toHaveCount(
            expectedForms,
          );
          const rate = receiptCase === "summary892_conflict10" ? 10 : 8;
          if (receiptCase === "summary892_tax52")
            await expect(banner).toContainText(
              "8%の税内訳：明細の税込合計 1,781円 ／ 支払合計 1,782円",
            );
          await banner
            .locator("li")
            .filter({ hasText: `${rate}%の税内訳：` })
            .getByRole("button", { name: "税内訳を修正" })
            .click();
          const editor = dialog.getByRole("region", { name: `${rate}%の税内訳を修正` });
          await expect(editor.getByText("確認が必要", { exact: true })).toBeVisible();
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
          if (receiptCase === "summary892_unknown" || receiptCase === "summary892_tax52")
            await expect(dialog.getByRole("region", { name: "10%の税内訳を修正" })).toHaveCount(0);
          await dialog.screenshot({ path: testInfo.outputPath("tax-summary-before.png") });
          if (receiptCase === "summary892_tax52") {
            const tax = editor.getByRole("spinbutton", { name: "税額", exact: true });
            await expect(tax).toHaveValue("52");
            await tax.fill("53");
            await editor.getByRole("button", { name: "保存", exact: true }).click();
          } else if (receiptCase === "summary892_unknown") {
            await expect(editor.getByRole("combobox", { name: "税モード" })).toContainText("不明");
            await editor.getByRole("combobox", { name: "税モード" }).click();
            await page.getByRole("option", { name: "外税", exact: true }).click();
            await editor.getByRole("button", { name: "保存", exact: true }).click();
          } else {
            if (receiptCase === "summary892_conflictBoth") {
              const targetAmount = editor.getByRole("spinbutton", { name: "対象額" });
              await targetAmount.fill("669");
              const product = dialog
                .getByRole("region", { name: "商品一覧" })
                .locator("details")
                .filter({ hasText: "食品0" });
              await product.locator("summary").click();
              await product.getByRole("textbox", { name: "明細名" }).fill("食品0の名称修正");
              await expect(targetAmount).toHaveValue("669");
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
          }
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
