import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupAiExpenseQueue } from "./helpers/cleanup";
import { seedMixedTaxReviewDraftByUser, seedTaxReviewDraftByUser } from "./helpers/seed";

const INPUT_PATH = "/weeks/current/input";

async function waitForReceiptInputQueue(page: Page) {
  await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "レシート入力" })).toBeVisible({
    timeout: 20_000,
  });
  const queue = page.locator(".input-workbench--expense");
  await expect(queue).toBeVisible({ timeout: 20_000 });
  return queue;
}

async function openFirstReviewDialog(page: Page) {
  const queue = await waitForReceiptInputQueue(page);
  const reviewButton = queue
    .getByRole("region", { name: "確認待ち" })
    .getByRole("button", { name: "確認する", exact: true })
    .first();
  await expect(reviewButton).toBeVisible({ timeout: 20_000 });
  await reviewButton.click();
  const dialog = page.getByRole("dialog", { name: "下書き確認" });
  await expect(dialog).toBeVisible();
  return { queue, dialog };
}

async function expectItemTaxRate(dialog: Locator, itemName: string, taxRate: string) {
  const detail = dialog.locator("details").filter({ hasText: itemName }).first();
  if ((await detail.getAttribute("open")) === null) await detail.locator("summary").click();
  await expect(detail.getByRole("combobox", { name: itemName + "の税率", exact: true })).toHaveText(
    taxRate,
  );
}

test.describe("Issue #672 税判定回帰の代表E2E", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("@smoke R001 ユーザー確認した支払総額を再編集後も保持する", async ({ page }) => {
    const userId = process.env.E2E_CLERK_USER_ID?.trim();
    if (!userId) {
      test.skip();
      return;
    }

    await gotoAuthenticated(page, INPUT_PATH);
    await waitForReceiptInputQueue(page);
    await seedTaxReviewDraftByUser(userId);
    await page.reload();
    const { queue, dialog } = await openFirstReviewDialog(page);

    await dialog.getByLabel("合計金額", { exact: true }).fill("7803");
    await dialog.getByRole("button", { name: "下書きを保存" }).click();
    await expect(dialog).toBeHidden();

    const reviewItem = queue
      .getByRole("region", { name: "確認待ち" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税レビュー店" })
      .first();
    await expect(reviewItem.getByText("7,803円")).toBeVisible();

    await reviewItem.getByRole("button", { name: "確認する" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("合計金額", { exact: true })).toHaveValue("7803");
  });

  test("@smoke R003 混在税率の商品修正後に詳細保存できる", async ({ page }) => {
    const userId = process.env.E2E_CLERK_USER_ID?.trim();
    if (!userId) {
      test.skip();
      return;
    }

    await gotoAuthenticated(page, INPUT_PATH);
    await waitForReceiptInputQueue(page);
    await seedMixedTaxReviewDraftByUser(userId);
    await page.reload();
    const { queue, dialog } = await openFirstReviewDialog(page);

    await expect(dialog.getByRole("heading", { name: /商品一覧/ })).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(800);

    // 未確認の各商品は、旧税内訳から逆算せず商品ごとに確認する。
    const expectedMixedTaxRates = { パン: "8%", 洗剤: "10%", 牛乳: "8%", ラップ: "10%" };
    const milkRow = dialog.locator('section[aria-label="商品一覧"] details').filter({
      hasText: "牛乳",
    });
    if ((await milkRow.getAttribute("open")) === null) await milkRow.locator("summary").click();
    const milkTaxRate = milkRow.getByRole("combobox", { name: "牛乳の税率", exact: true });
    await expect
      .poll(async () => (await milkTaxRate.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(176);
    await milkTaxRate.click();
    await page.getByRole("option", { name: "8%", exact: true }).click();
    await dialog.getByRole("combobox", { name: "牛乳の表示価格", exact: true }).click();
    await page.getByRole("option", { name: "税込", exact: true }).click();
    await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
      "税の確認待ち 1件",
    );
    const wrapRow = dialog
      .locator('section[aria-label="商品一覧"] details')
      .filter({ hasText: "ラップ" });
    if ((await wrapRow.getAttribute("open")) === null) await wrapRow.locator("summary").click();
    await wrapRow.getByRole("combobox", { name: "ラップの税率", exact: true }).click();
    await page.getByRole("option", { name: "10%", exact: true }).click();
    await wrapRow.getByRole("combobox", { name: "ラップの表示価格", exact: true }).click();
    await page.getByRole("option", { name: "税込", exact: true }).click();

    await expect(
      dialog.getByRole("region", { name: "全体の確認状態" }).getByText(/税率・税込／税抜/),
    ).toHaveCount(0);
    // 金額・税率別ともに一致のため検算カードは出さず、成功メッセージだけが残る
    await expect(
      dialog
        .getByRole("region", { name: "全体の確認状態" })
        .getByText("印字額と明細の金額が一致しています"),
    ).toBeVisible();
    await expect(dialog.getByRole("region", { name: "確認結果" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "この内容で保存" }).click();
    await expect(dialog).toBeHidden();

    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E混在税レビュー店" })
      .first();
    await expect(readyItem).toBeVisible({ timeout: 15_000 });
    await readyItem.getByRole("button", { name: "修正する" }).click();
    const reopenedDialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(reopenedDialog).toBeVisible();
    for (const [itemName, expectedRate] of Object.entries(expectedMixedTaxRates)) {
      await expectItemTaxRate(reopenedDialog, itemName, expectedRate);
    }
  });
});
