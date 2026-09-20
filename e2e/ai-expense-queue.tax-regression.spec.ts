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

    // 要確認の明細行は畳んだまま表示する。牛乳を開いて直すと残りはサーバ側の再解釈で解決される。
    const expectedMixedTaxRates = { パン: "8%", 洗剤: "10%", 牛乳: "8%", ラップ: "10%" };
    const milkRow = dialog.locator('section[aria-label="商品一覧"] details').filter({
      hasText: "牛乳",
    });
    await milkRow.getByRole("button", { name: "確認・修正" }).click();
    await milkRow.getByRole("combobox", { name: "牛乳の税率", exact: true }).click();
    await page.getByRole("option", { name: "8%", exact: true }).click();
    await dialog.getByRole("combobox", { name: "牛乳の表示価格", exact: true }).click();
    await page.getByRole("option", { name: "税込", exact: true }).click();
    await expect(
      dialog.getByRole("region", { name: "全体の確認状態" }).getByText(/税率・税込／税抜/),
    ).toHaveCount(0);
    const checkSection = dialog.getByRole("region", { name: "確認結果" });
    await expect(
      checkSection.getByText("明細合計 438円 ＝ 支払額 438円", { exact: true }),
    ).toBeVisible();
    await expect(checkSection.getByText(/現在 218円 ／ 印字 218円/)).toBeVisible();
    await expect(checkSection.getByText(/現在 220円 ／ 印字 220円/)).toBeVisible();
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

  // totalOnly の下書きは dev バックエンドのシードに依存せず、
  // フロントのみの __e2e__ fixture で確認する（registrationMode の表示・保存導線）。
  test("@smoke R018 確認済みtotalOnlyの下書きは合計だけ保存モードで開ける", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue?withItems=1&totalOnly=1");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("review-totalonly.png")).toBeVisible();
    await reviewSection
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "review-totalonly.png" })
      .getByRole("button", { name: "確認する" })
      .click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("合計金額", { exact: true }).fill("5000");
    await expect(dialog.getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();
    await expect(dialog).toBeHidden();

    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E合計のみ店" });
    await expect(readyItem.getByText("5,000円")).toBeVisible();
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();
    await expect(readyItem.getByRole("button", { name: "登録する" })).toBeEnabled();
  });

  test("@smoke totalOnlyの下書きは再編集しても合計だけ登録を維持できる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue?withItems=1&totalOnly=1");

    const queue = page.getByRole("region", { name: "レシート入力" });
    await queue
      .getByRole("region", { name: "確認待ち" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "review-totalonly.png" })
      .getByRole("button", { name: "確認する" })
      .click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();
    await expect(dialog).toBeHidden();

    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E合計のみ店" })
      .first();
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();
    await readyItem.getByRole("button", { name: "修正する" }).click();
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "レシート合計だけ保存" })).toBeEnabled();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();
    await expect(dialog).toBeHidden();
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();
    await expect(readyItem.getByRole("button", { name: "登録する" })).toBeEnabled();
  });
});
