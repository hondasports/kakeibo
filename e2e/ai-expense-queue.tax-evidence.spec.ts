import { expect, test, type Locator, type Page } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import { cleanupAiExpenseQueue, cleanupTestReceipts } from "./helpers/cleanup";
import { seedTaxReviewDraftByUser } from "./helpers/seed";
import { expandDetailsIfClosed } from "./helpers/receiptQueue";

async function confirmProducts(page: Page, dialog: Locator) {
  for (let index = 1; index <= 5; index++) {
    const name = `商品${index}`;
    const row = dialog
      .getByRole("region", { name: "商品一覧" })
      .locator("details")
      .filter({ hasText: name });
    await expandDetailsIfClosed(row);
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

for (const width of [1280]) {
  test(`${width === 1280 ? "@smoke " : ""}Issue #1015 ${width}px 商品確認→自動計算→即時保存→再表示→登録が一致する`, async ({
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
      await expect(dialog.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveCount(0);
      await expect(dialog.getByText("税内訳を確認", { exact: true })).toHaveCount(0);
      await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
      const product = dialog.getByRole("region", { name: "商品一覧" });
      const bounds = await product.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await dialog.screenshot({ path: testInfo.outputPath("tax-evidence-resolved.png") });
      // 最終保存前に閉じても商品の税設定と再計算結果は即時保存されている。
      await dialog.getByLabel("閉じる", { exact: true }).click();
      await expect(dialog).toBeHidden();
      await row.getByRole("button", { name: /確認する|修正する/ }).click();
      await expect(dialog.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveCount(0);
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
      await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText("確認推奨 0件");
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

test("Issue #1015 印字対象額の矛盾は商品確認後も保持し、内部値の編集を要求しない", async ({
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
    await expect(dialog.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("region", { name: "確認件数" })).not.toContainText(
      "確認推奨 0件",
    );
    await expect(dialog.getByRole("button", { name: "税内訳を修正", exact: true })).toHaveCount(0);
    await dialog.getByText("読み取り原文（参考）").click();
    await expect(dialog.getByText("10%対象 4,373円", { exact: true })).toBeVisible();
  } finally {
    await cleanupAiExpenseQueue();
  }
});

// 軸の順序差は handler 層の updateItemTaxOverrides.confirmation.test.ts が
// it.each で両方向をカバー済みなので、E2E ではブラウザ導線の代表1方向だけを確認する（#1159）。
test("Issue #1015 片軸確認を保存してから残りを確認できる", async ({ page }) => {
  await gotoAuthenticated(page, "/weeks/current/input");
  await cleanupAiExpenseQueue();
  try {
    await seedTaxReviewDraftByUser(await getCurrentClerkTokenIdentifier(page));
    await page.reload();
    const queue = page.locator(".input-workbench--expense");
    const queued = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E税レビュー店" });
    await queued.getByRole("button", { name: "確認する", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    const item = dialog
      .getByRole("region", { name: "商品一覧" })
      .locator("details")
      .filter({ hasText: "E2E税テスト商品" });
    const steps = [
      { label: "E2E税テスト商品の税率", option: "8%" },
      { label: "E2E税テスト商品の表示価格", option: "税抜" },
    ];
    for (const [index, step] of steps.entries()) {
      await expandDetailsIfClosed(item);
      const select = item.getByRole("combobox", { name: step.label, exact: true });
      await select.click();
      await page.getByRole("option", { name: step.option, exact: true }).click();
      await expect(select).toBeEnabled();
      if (index === 0) {
        await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
          "税の確認待ち 1件",
        );
        await dialog.getByRole("button", { name: "下書きを保存", exact: true }).click();
        await expect(dialog).toBeHidden();
        await queued.getByRole("button", { name: "確認する", exact: true }).click();
        await expandDetailsIfClosed(item);
        await expect(item.getByRole("combobox", { name: step.label, exact: true })).toHaveText(
          step.option,
        );
        await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
          "税の確認待ち 1件",
        );
        await item.getByRole("combobox", { name: step.label, exact: true }).click();
        await page.getByRole("option", { name: step.option, exact: true }).click();
        await expect(item.getByRole("combobox", { name: step.label, exact: true })).toBeEnabled();
        await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
          "税の確認待ち 1件",
        );
      }
    }
    await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    const ready = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税レビュー店" });
    await ready.getByRole("button", { name: "修正する", exact: true }).click();
    await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await ready.getByRole("button", { name: "登録する", exact: true }).click();
    await expect(queue.getByRole("region", { name: "登録済み" })).toContainText("108円");
  } finally {
    await cleanupTestReceipts();
    await cleanupAiExpenseQueue();
  }
});

for (const saveBeforeRate of [false, true]) {
  test(`Issue #1015 商品名変更後に税率を再確認して保存・登録できる 途中保存=${saveBeforeRate}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: saveBeforeRate ? 320 : 1280, height: 900 });
    await gotoAuthenticated(page, "/weeks/current/input");
    await cleanupAiExpenseQueue();
    try {
      await seedTaxReviewDraftByUser(await getCurrentClerkTokenIdentifier(page));
      await page.reload();
      const queue = page.locator(".input-workbench--expense");
      const queued = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E税レビュー店" });
      await queued.getByRole("button", { name: "確認する", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "下書き確認" });
      let product = dialog
        .getByRole("region", { name: "商品一覧" })
        .locator("details")
        .filter({ hasText: "E2E税テスト商品" });
      await expandDetailsIfClosed(product);
      for (const [label, option] of [
        ["税率", "8%"],
        ["表示価格", "税抜"],
      ]) {
        const select = product.getByRole("combobox", {
          name: `E2E税テスト商品の${label}`,
          exact: true,
        });
        await select.click();
        await page.getByRole("option", { name: option, exact: true }).click();
        await expect(select).toBeEnabled();
      }
      await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
      await product.getByRole("textbox", { name: "明細名", exact: true }).fill("変更後の商品");
      product = dialog
        .getByRole("region", { name: "商品一覧" })
        .locator("details")
        .filter({ hasText: "変更後の商品" });
      await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
        "税の確認待ち 1件",
      );
      if (saveBeforeRate) {
        await dialog.getByRole("button", { name: "下書きを保存", exact: true }).click();
        await expect(dialog).toBeHidden();
        await queued.getByRole("button", { name: "確認する", exact: true }).click();
        await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
          "税の確認待ち 1件",
        );
      }
      await expandDetailsIfClosed(product);
      await expect(product.locator("summary")).toContainText("8%");
      await expect(product.locator("summary")).toContainText("税抜");
      await expect(product.locator("summary")).toContainText("確認待ち");
      await expect(product).toContainText("商品名・行の種類が変わっています");
      await expect(dialog.getByText(/税内訳を読み取れていません/)).toHaveCount(0);
      const bounds = await product.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(saveBeforeRate ? 320 : 1280);
      await product.screenshot({ path: testInfo.outputPath("tax-confirmation-pending.png") });
      const rate = product.getByRole("combobox", { name: "変更後の商品の税率", exact: true });
      if (saveBeforeRate) {
        await product.getByRole("button", { name: "この税設定を確認する", exact: true }).click();
      } else {
        await rate.click();
        await page.getByRole("option", { name: "8%", exact: true }).click();
      }
      await expect(rate).toBeEnabled();
      await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
      await expect(
        product.getByRole("button", { name: "この税設定を確認する", exact: true }),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
      await expect(dialog).toBeHidden();
      const ready = queue
        .getByRole("region", { name: "登録できます" })
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E税レビュー店" });
      await ready.getByRole("button", { name: "修正する", exact: true }).click();
      await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
      await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
      await expect(dialog).toBeHidden();
      await ready.getByRole("button", { name: "登録する", exact: true }).click();
      await expect(queue.getByRole("region", { name: "登録済み" })).toContainText("108円");
    } finally {
      await cleanupTestReceipts();
      await cleanupAiExpenseQueue();
    }
  });
}
