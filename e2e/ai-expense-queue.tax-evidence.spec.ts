import { expect, test, type Locator, type Page } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import { cleanupAiExpenseQueue, cleanupTestReceipts } from "./helpers/cleanup";
import { seedTaxReviewDraftByUser } from "./helpers/seed";

async function confirmProducts(page: Page, dialog: Locator) {
  for (let index = 1; index <= 5; index++) {
    const name = `商品${index}`;
    const row = dialog
      .getByRole("region", { name: "商品一覧" })
      .locator("details")
      .filter({ hasText: name });
    if ((await row.getAttribute("open")) === null) await row.locator("summary").click();
    await row.getByRole("combobox", { name: `${name}の税率`, exact: true }).click();
    await page.getByRole("option", { name: "10%", exact: true }).click();
    await expect(row.getByRole("combobox", { name: `${name}の税率`, exact: true })).toBeEnabled();
    await row.getByRole("combobox", { name: `${name}の表示価格`, exact: true }).click();
    await page.getByRole("option", { name: "税込", exact: true }).click();
    await expect(
      row.getByRole("combobox", { name: `${name}の表示価格`, exact: true }),
    ).toBeEnabled();
  }
}

for (const width of [1280, 320]) {
  test(`Issue #1003 ${width}px 商品確認→自動計算→即時保存→再表示→登録が一致する`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoAuthenticated(page, "/weeks/current/input");
    await cleanupAiExpenseQueue();
    try {
      await seedTaxReviewDraftByUser(await getCurrentClerkTokenIdentifier(page), "unproven1003");
      await page.reload();
      const queue = page.locator(".input-workbench--expense");
      const row = queue
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E対象額レビュー店" });
      await row.getByRole("button", { name: "確認する", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "下書き確認" });
      await confirmProducts(page, dialog);
      await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("修正必須 0件");
      await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("確認推奨 0件");
      await expect(dialog.getByText("金額を確認してください。", { exact: true })).toHaveCount(0);
      const summary = dialog.getByRole("region", { name: "10%の税内訳を修正" });
      await expect(summary).toContainText("商品から自動再計算");
      await expect(summary).toContainText("対象額 4,810円（税込）");
      await expect(summary).toContainText("税額 437円");
      const disclosure = summary.locator("summary");
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await expect(summary).toHaveAttribute("open");
      await expect(summary.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveValue(
        "4810",
      );
      await expect(summary).toContainText("変更前の対象額 4373円 → 現在 4810円");
      await expect(summary).toContainText("内消費税10% 437円");
      const bounds = await summary.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await dialog.screenshot({ path: testInfo.outputPath("tax-evidence-resolved.png") });
      // 最終保存前に閉じても商品の税設定と再計算結果は即時保存されている。
      await dialog.getByLabel("閉じる", { exact: true }).click();
      await expect(dialog).toBeHidden();
      await row.getByRole("button", { name: /確認する|修正する/ }).click();
      await expect(summary).toContainText("商品から自動再計算");
      await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("確認推奨 0件");
      await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
      await expect(dialog).toBeHidden();
      const ready = queue
        .getByRole("region", { name: "登録できます" })
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E対象額レビュー店" });
      await expect(ready).toContainText("4,810円");
      await expect(ready).not.toContainText("金額・税内訳の確認が必要");
      await ready.getByRole("button", { name: "修正する", exact: true }).click();
      await expect(summary).toContainText("対象額 4,810円（税込）");
      await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
      await expect(dialog).toBeHidden();
      await ready.getByRole("button", { name: "登録する", exact: true }).click();
      await expect(queue.getByRole("region", { name: "登録済み" })).toContainText("4,810円");
    } finally {
      await cleanupTestReceipts();
      await cleanupAiExpenseQueue();
    }
  });
}

test("Issue #1003 印字対象額の矛盾は商品確認後も残り、原文を探索せず修正できる", async ({
  page,
}) => {
  await gotoAuthenticated(page, "/weeks/current/input");
  await cleanupAiExpenseQueue();
  try {
    await seedTaxReviewDraftByUser(await getCurrentClerkTokenIdentifier(page), "printed1003");
    await page.reload();
    const queue = page.locator(".input-workbench--expense");
    await queue.getByRole("button", { name: "確認する", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await confirmProducts(page, dialog);
    const summary = dialog.getByRole("region", { name: "10%の税内訳を修正" });
    await expect(summary).toContainText("OCR原文の対象額");
    await expect(summary.getByRole("spinbutton", { name: "対象額" })).toHaveValue("4373");
    await expect(dialog.getByRole("region", { name: "確認件数" })).not.toContainText(
      "修正必須 0件",
    );
    const reference = dialog.getByText("読み取り原文・詳しい税情報（参考）").locator("..");
    await expect(reference).not.toHaveAttribute("open");
    await expect(summary).toContainText("10%対象 4,373円");
    await summary.getByRole("spinbutton", { name: "対象額" }).fill("4810");
    await summary.getByRole("button", { name: "保存", exact: true }).click();
    await expect(summary).toContainText("ユーザー修正（保存済み）");
    await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("確認推奨 0件");
    await summary.locator("summary").click();
    await expect(summary.getByRole("spinbutton", { name: "対象額" })).toHaveValue("4810");
  } finally {
    await cleanupAiExpenseQueue();
  }
});
