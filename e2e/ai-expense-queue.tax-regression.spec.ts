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
    await dialog.getByRole("radio", { name: "分からない" }).first().check();
    await expect(dialog.getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();

    const readySection = queue.getByRole("region", { name: "登録できます" });
    const readyItem = readySection.locator(".ai-expense-queue-item").first();
    await expect(readyItem.getByText("7,803円")).toBeVisible();
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();

    await readyItem.getByRole("button", { name: "修正する" }).click();
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

    await dialog.getByRole("radio", { name: "商品によって異なる" }).check();
    await dialog.getByRole("radio", { name: "8%と10%が混ざっている" }).check();
    const expectedMixedTaxRates = { パン: "8%", 洗剤: "10%", 牛乳: "8%", ラップ: "10%" };
    const milk = dialog.getByRole("combobox", { name: "牛乳の税率", exact: true });
    await milk.click();
    await page.getByRole("option", { name: "8%", exact: true }).click();
    await expect(
      dialog.getByRole("region", { name: "確認すること" }).getByText(/税率・税込／税抜/),
    ).toHaveCount(0);
    await expect(dialog.getByText("商品合計：438円", { exact: true })).toBeVisible();
    await expect(dialog.getByText("商品の税額：36円", { exact: true })).toBeVisible();
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

  test("@smoke R018 確認済みtotalOnlyの5000円を登録できる", async ({ page }) => {
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

    await dialog.getByLabel("合計金額", { exact: true }).fill("5000");
    await dialog.getByRole("radio", { name: "分からない" }).first().check();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();

    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .first();
    await expect(readyItem.getByText("5,000円")).toBeVisible();
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();
    await expect(readyItem.getByRole("button", { name: "登録する" })).toBeVisible({
      timeout: 15_000,
    });
    await readyItem.getByRole("button", { name: "登録する" }).click();
    await expect(
      queue
        .getByRole("region", { name: "登録済み" })
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E税レビュー店" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      queue
        .getByRole("region", { name: "登録済み" })
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E税レビュー店" })
        .getByText("5,000円"),
    ).toBeVisible();
  });

  test("@smoke totalOnlyからdetailedへ再編集して登録できる", async ({ page }) => {
    const userId = process.env.E2E_CLERK_USER_ID?.trim();
    const userEmail = process.env.E2E_CLERK_USER_EMAIL?.trim();
    if (!userId || !userEmail) {
      test.skip();
      return;
    }

    await gotoAuthenticated(page, INPUT_PATH);
    await waitForReceiptInputQueue(page);
    await seedTaxReviewDraftByUser(userId);
    await page.reload();
    const { queue, dialog } = await openFirstReviewDialog(page);

    await dialog.getByRole("radio", { name: "分からない" }).first().check();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();
    await expect(dialog).toBeHidden();

    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税レビュー店" })
      .first();
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();
    await readyItem.getByRole("button", { name: "修正する" }).click();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "表示価格にあとから税が加算される" }).check();
    await dialog.getByRole("radio", { name: "すべて8%" }).check();
    await dialog.getByRole("radio", { name: "明細ごとに保存" }).check();
    await expect(dialog.getByRole("button", { name: "この内容で保存" })).toBeEnabled();
    await dialog.getByRole("button", { name: "この内容で保存" }).click();
    await expect(dialog).toBeHidden();
    await expect(readyItem.getByText("合計だけで保存")).toHaveCount(0);

    await readyItem.getByRole("button", { name: "登録する" }).click();
    const registeredItems = queue
      .getByRole("region", { name: "登録済み" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税レビュー店" });
    await expect(registeredItems).toHaveCount(1, { timeout: 15_000 });
    await expect(registeredItems.first().getByText("108円")).toBeVisible();
  });
});
