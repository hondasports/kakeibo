import { test, expect, type Locator, type Page } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import { expectLocatorInsideContainer, expectLocatorInsideViewport } from "./helpers/viewport";
import {
  cleanupAiExpenseQueue,
  cleanupE2eExpenseEntries,
  cleanupTestCategories,
  cleanupAiExpenseQueueByUser,
  cleanupE2eExpenseEntriesByUser,
  cleanupTestCategoriesByUser,
} from "./helpers/cleanup";
import {
  seedAiExpenseDraftForExpenseEntriesByUser,
  seedMixedTaxReviewDraftByUser,
  seedTaxReviewDraftByUser,
  seedTaxSummaryConflictDraftByUser,
} from "./helpers/seed";
import { createSyntheticReceiptImage } from "./helpers/syntheticImage";

/**
 * Issue #144: 支出画像の読み取りUI
 *
 * カバーするシナリオ:
 * - 複数画像を連続追加すると、各画像が解析待ちとしてキューに表示される。
 * - SP幅でも追加ボタン、キュー状態、既存の画像入力・手入力フォームが破綻しない。
 */

const INPUT_PATH = "/weeks/current/input";

/** 週次セッション読み込み後にレシート入力ワークベンチが表示されるまで待つ */
async function waitForReceiptInputQueue(page: Page) {
  await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "レシート入力" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("region", { name: "レシート入力", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const queue = page.locator(".input-workbench--expense");
  await expect(queue).toBeVisible({ timeout: 20_000 });
  return queue;
}

/** ヘッダーの ImageInputButton（空状態 CTA と区別する） */
function getHeaderAddReceiptButton(queue: Locator) {
  return queue.getByRole("button", { name: "画像を読み取る", exact: true }).first();
}

async function acceptReceiptImageConsentIfNeeded(page: Page, firstFileName: string) {
  const consentDialog = page.getByRole("dialog", {
    name: "画像を読み取る",
  });
  const firstQueueItem = page.locator(".input-workbench--expense").getByText(firstFileName).first();

  await expect(consentDialog.or(firstQueueItem).first()).toBeVisible({ timeout: 30_000 });
  if (await consentDialog.isVisible()) {
    await consentDialog.getByRole("button", { name: "画像を読み取る" }).click();
  }
}

test.describe("Issue #144 読み取りUI", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("@smoke 複数画像を解析待ちとして追加できる", async ({ page }) => {
    await gotoAuthenticated(page, INPUT_PATH);

    const queue = await waitForReceiptInputQueue(page);
    await expect(page.getByLabel("読み取り用画像を追加")).toBeEnabled();

    const stamp = Date.now();
    const queueFiles = [
      await createSyntheticReceiptImage(page, `ai-queue-receipt-${stamp}.jpg`),
      await createSyntheticReceiptImage(page, `ai-queue-payment-${stamp}.jpg`),
    ];
    await page.getByLabel("読み取り用画像を追加").setInputFiles(queueFiles);
    await acceptReceiptImageConsentIfNeeded(page, `ai-queue-receipt-${stamp}.jpg`);

    // Issue #152: 非同期ジョブの subscription 反映を待つ。
    // dev DB に同名ファイルの過去ジョブが残っている可能性があるため .first() で限定する。
    await expect(queue.getByText(`ai-queue-receipt-${stamp}.jpg`).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(queue.getByText(`ai-queue-payment-${stamp}.jpg`).first()).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(
        async () => {
          const statusLabels = ["読み取り中", "登録できます", "確認待ち", "読み取り失敗"];
          let total = 0;
          for (const label of statusLabels) {
            total += await queue.getByText(label).count();
          }
          return total;
        },
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(2);
    const batchProgress = queue.getByText(/今回の追加 \d+\/2件が登録準備OK/).first();
    await expect(batchProgress).toBeVisible({ timeout: 15_000 });
    const batchRegisterButton = queue.getByRole("button", { name: /まとめて登録（\d+件）/ }).last();
    await expect(batchRegisterButton).toBeVisible();
    const batchProgressText = (await batchProgress.textContent()) ?? "";
    if (batchProgressText.includes("2/2")) {
      await expect(batchRegisterButton).toBeEnabled();
    } else {
      await expect(batchRegisterButton).toBeDisabled();
    }
    const processingSection = queue.getByRole("region", { name: "読み取り中" });
    await expect(processingSection).toBeVisible();
    await expect(processingSection.getByText("2件")).toBeVisible();

    await expect(page.getByRole("region", { name: "画像から入力" })).toHaveCount(0);
    // Issue #181: ReceiptForm → ExpenseEntryForm に変更
    await expect(page.getByLabel("店舗名 / 支払先")).toBeVisible();
    await expect(page.getByLabel("合計金額")).toBeVisible();
  });

  test("@smoke セッション中の画像をサムネイルからプレビューできる", async ({ page }) => {
    await gotoAuthenticated(page, INPUT_PATH);

    const queue = await waitForReceiptInputQueue(page);
    const stamp = Date.now();
    const files = [
      await createSyntheticReceiptImage(page, `ai-queue-preview-${stamp}.jpg`),
      await createSyntheticReceiptImage(page, `ai-queue-preview-2-${stamp}.jpg`),
    ];
    await page.getByLabel("読み取り用画像を追加").setInputFiles(files);
    await acceptReceiptImageConsentIfNeeded(page, `ai-queue-preview-${stamp}.jpg`);

    const previewButton = queue.getByRole("button", {
      name: `ai-queue-preview-${stamp}.jpgの画像をプレビュー`,
    });
    await expect(previewButton).toBeVisible({ timeout: 15_000 });
    await previewButton.click();

    const dialog = page.getByRole("dialog", {
      name: `ai-queue-preview-${stamp}.jpgの画像プレビュー`,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: `ai-queue-preview-${stamp}.jpgのレシート画像` }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "プレビューを閉じる" }).click();
    await expect(dialog).toBeHidden();
  });

  test("@smoke SP幅では撮影して追加導線が表示され、撮影用inputにcapture属性が付く", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 441, height: 864 });
    await gotoAuthenticated(page, INPUT_PATH);

    await expectLocatorInsideViewport(page.locator(".user-menu-button"));
    await expect(page.locator(".user-menu-button > span")).toBeHidden();

    const queue = await waitForReceiptInputQueue(page);
    await expectLocatorInsideViewport(queue);
    const cameraButton = queue.getByRole("button", { name: "カメラで撮影" });
    const imageButton = getHeaderAddReceiptButton(queue);
    await expect(cameraButton).toBeEnabled();
    await expectLocatorInsideViewport(cameraButton);
    await expectLocatorInsideContainer(cameraButton, queue);
    await expectLocatorInsideViewport(imageButton);
    await expectLocatorInsideContainer(imageButton, queue);
    await expect(page.getByLabel("読み取り用カメラ画像を追加")).toHaveAttribute(
      "capture",
      "environment",
    );

    const stamp = Date.now();
    const cameraFiles = [await createSyntheticReceiptImage(page, `ai-queue-camera-${stamp}.jpg`)];
    await page.getByLabel("読み取り用カメラ画像を追加").setInputFiles(cameraFiles);
    await acceptReceiptImageConsentIfNeeded(page, `ai-queue-camera-${stamp}.jpg`);

    await expect
      .poll(async () => (await queue.getByText(`ai-queue-camera-${stamp}.jpg`).count()) > 0, {
        timeout: 30_000,
      })
      .toBe(true);
    await expectLocatorInsideViewport(queue);
  });

  test("@smoke SP幅でも複数画像追加後のキューと入力導線を操作できる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAuthenticated(page, INPUT_PATH);

    const queue = await waitForReceiptInputQueue(page);
    await expectLocatorInsideViewport(queue);
    await expect(page.getByLabel("読み取り用画像を追加")).toBeEnabled();
    const stamp = Date.now();
    const queueFiles = [
      await createSyntheticReceiptImage(page, `ai-queue-receipt-${stamp}.jpg`),
      await createSyntheticReceiptImage(page, `ai-queue-payment-${stamp}.jpg`),
    ];
    await page.getByLabel("読み取り用画像を追加").setInputFiles(queueFiles);
    await acceptReceiptImageConsentIfNeeded(page, `ai-queue-receipt-${stamp}.jpg`);

    // Issue #152: 非同期ジョブの subscription 反映を待つ。
    // dev DB に同名ファイルの過去ジョブが残っている可能性があるため .first() で限定する。
    await expect(queue.getByText(`ai-queue-receipt-${stamp}.jpg`).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(queue.getByText(`ai-queue-payment-${stamp}.jpg`).first()).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(
        async () => {
          const statusLabels = ["読み取り中", "登録できます", "確認待ち", "読み取り失敗"];
          let total = 0;
          for (const label of statusLabels) {
            total += await queue.getByText(label).count();
          }
          return total;
        },
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(2);
    // Issue #181: 保存ボタンは変わらず「保存して次へ」
    await expect(page.getByRole("button", { name: "保存して次へ" })).toBeVisible();
    await expectLocatorInsideViewport(queue);
  });
});

test.describe("Issue #146 AI支出下書きの確認要否分類", () => {
  test("確認が必要な下書きの reviewReasons を日本語で表示する", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    await expect(queue).toBeVisible();
    await expect(queue.getByText("登録できます 1件")).toBeVisible();
    await expect(queue.getByText("確認待ち 1件")).toBeVisible();
    await expect(queue.getByText("読み取り失敗 1件")).toBeVisible();

    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("review-payment.png")).toBeVisible();
    await expect(reviewSection.getByText("未分類あり")).toBeVisible();
    await expect(reviewSection.getByText("他2件")).toBeVisible();
    await expect(reviewSection.getByRole("button", { name: "確認する" })).toBeEnabled();

    const failedSection = queue.getByRole("region", { name: "読み取り失敗" });
    await expect(failedSection.getByText("failed-receipt.png")).toBeVisible();
    await expect(failedSection.getByText("解析失敗")).toBeVisible();
    await expect(
      failedSection.getByText(
        "明るい場所で、影や反射を避け、レシート全体を正面から撮影してください。",
      ),
    ).toBeVisible();
    await expect(failedSection.getByRole("button", { name: "再解析" })).toBeDisabled();
    await expect(failedSection.getByRole("button", { name: "再撮影" })).toBeEnabled();
    await expect(page.getByLabel("再撮影する画像を選択")).toHaveAttribute("capture", "environment");
  });
});

test.describe("Issue #148 確認が必要なAI支出下書きの編集導線", () => {
  test("確認が必要な下書きを編集して登録準備OKに戻せる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("review-payment.png")).toBeVisible();

    await reviewSection.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("店名・内容").fill("大阪市水道局 水道料金");
    await dialog.getByLabel("合計金額").fill("9160");
    await dialog.getByRole("button", { name: "この内容で保存" }).click();

    await expect(dialog).toBeHidden();
    await expect(queue.getByText("確認待ち 0件")).toHaveCount(0);
    await expect(queue.getByText("登録できます 2件")).toBeVisible();
    const readySection = queue.getByRole("region", { name: "登録できます" });
    await expect(readySection.getByText("大阪市水道局")).toBeVisible();
    await expect(readySection.getByText("9,160円")).toBeVisible();
  });

  test("確認が必要な下書きを編集して登録準備OKにできる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("review-payment.png")).toBeVisible();

    await reviewSection.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("読み取り内容の信頼度が低い")).toBeVisible();
    await expect(dialog.getByText("必須項目不足")).toBeVisible();
    await expect(dialog.getByRole("region", { name: "OCR原文" })).toContainText(
      "大阪市水道局 水道料金（金額文字列: 9,120円）",
    );
    await expect(dialog.getByLabel("支出日（レシート記載日）")).toHaveValue("2026-06-01");
    await expect(dialog.getByLabel("合計金額")).toHaveValue("9120");
    await expect(dialog.getByLabel("店名・内容")).toHaveValue("大阪市水道局");

    await dialog.getByLabel("店名・内容").fill("大阪市水道局 水道料金");
    await dialog.getByLabel("合計金額").fill("9160");
    await dialog.getByRole("button", { name: "この内容で保存" }).click();

    await expect(dialog).toBeHidden();
    await expect(queue.getByText("確認待ち 0件")).toHaveCount(0);
    const readySection = queue.getByRole("region", { name: "登録できます" });
    await expect(readySection.getByText("大阪市水道局")).toBeVisible();
    await expect(readySection.getByText("2026/06/01 ・ 9,160円")).toBeVisible();
  });
});

test.describe("Issue #321 AI支出下書きの明細確認・修正UI", () => {
  test("明細のカテゴリ・金額・追加・削除を操作できる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue?withItems=1");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("review-payment.png")).toBeVisible();

    await reviewSection.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "登録候補" })).toHaveCount(0);
    await expect(dialog.getByRole("region", { name: "商品と割引" })).toBeVisible();
    await expect(dialog.getByText("未分類の明細があります")).toHaveCount(0);
    await expect(dialog.getByText("低信頼度の明細があります")).toHaveCount(0);

    for (const summary of await dialog
      .locator('section[aria-label="商品と割引"] details:not([open]) > summary')
      .all())
      await summary.click();
    await expect(dialog.getByRole("heading", { name: /商品と割引/ })).toBeVisible();
    await expect(dialog.getByRole("region", { name: "保存内容" })).toBeVisible();
    await expect(dialog.getByText(/^支払額：/)).toBeVisible();
    await expect(dialog.getByText(/読み取り間違いがないか/).first()).toBeVisible();
    await expect(dialog.getByLabel("明細カテゴリ")).toHaveCount(2);
    await expect(dialog.getByLabel("明細カテゴリ").nth(0)).toHaveValue("食費");
    await expect(dialog.getByLabel("明細カテゴリ").nth(1)).toHaveValue("水道光熱費");
    await dialog.getByLabel("明細カテゴリ").nth(0).click();
    await page.getByRole("option", { name: "水道光熱費" }).click();
    await expect(dialog.getByLabel("明細カテゴリ").nth(0)).toHaveValue("水道光熱費");

    await dialog.getByLabel("レシートの金額", { exact: true }).first().fill("400");
    await dialog.getByRole("button", { name: "胃薬を削除" }).click();
    await dialog.getByRole("button", { name: "明細を追加" }).click();

    await dialog.getByLabel("明細名").nth(1).fill("牛乳");
    await dialog.getByLabel("レシートの金額", { exact: true }).nth(1).fill("520");
    await dialog.getByLabel("明細カテゴリ").nth(0).click();
    await page.getByRole("option", { name: "食費" }).click();
    await dialog.getByLabel("明細カテゴリ").nth(1).click();
    await page.getByRole("option", { name: "食費" }).click();

    await dialog.getByLabel("明細カテゴリ").nth(0).click();
    await page.getByRole("option", { name: "水道光熱費" }).click();

    await dialog.getByLabel("店名・内容").fill("大阪市水道局 水道料金");
    await dialog.getByLabel("合計金額").fill("920");
    await dialog.getByRole("button", { name: "この内容で保存" }).click();

    await expect(dialog).toBeHidden();
    await expect(queue.getByText("確認待ち 0件")).toHaveCount(0);
    await expect(queue.getByText("登録できます 2件")).toBeVisible();
  });
});

test.describe("Issue #431 レシート税判定UI", () => {
  test("@smoke 下書き確認に分析ステータスと明細税率が表示される", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue?withItems=1");

    const queue = page.getByRole("region", { name: "レシート入力" });
    await queue
      .getByRole("region", { name: "確認待ち" })
      .getByRole("button", { name: "確認する" })
      .click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog.getByRole("region", { name: "保存内容" })).toBeVisible();
    await expect(dialog.getByText(/^支払額：/)).toBeVisible();
    await expect(dialog.getByText(/^商品合計：/)).toBeVisible();

    await expect(dialog.getByText(/税情報は未確定/).first()).toBeVisible();
  });
});

test.describe("下書き確認の税状態保存", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("2段階選択後の明細編集保存で税状態が再オープン後も維持される", async ({ page }) => {
    const userId = process.env.E2E_CLERK_USER_ID?.trim();
    if (!userId) {
      test.skip();
      return;
    }

    await seedTaxReviewDraftByUser(userId);
    await gotoAuthenticated(page, INPUT_PATH);

    const queue = await waitForReceiptInputQueue(page);
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    const taxReviewItem = reviewSection
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税レビュー店" });
    await expect(taxReviewItem).toBeVisible({ timeout: 15_000 });
    await taxReviewItem.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await dialog.getByRole("radio", { name: "表示価格にあとから税が加算される" }).check();
    await dialog.getByRole("radio", { name: "すべて8%" }).check();
    for (const summary of await dialog
      .locator('section[aria-label="商品と割引"] details:not([open]) > summary')
      .all())
      await summary.click();
    await expect(dialog.getByText(/税率 8%/).first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("差額：0円（金額一致）")).toBeVisible();

    await dialog.getByLabel("レシートの金額", { exact: true }).fill("99");
    await expect(dialog.getByText(/^商品合計：/)).toBeVisible();
    await expect(dialog.getByText("登録額: 107円（税込）")).toBeVisible();
    await expect(dialog.getByText("差額：1円")).toBeVisible();
    await expect(dialog.getByText(/登録額: \d+円（税込）/)).toBeVisible();
    await dialog.getByRole("button", { name: "この内容で保存" }).click();
    await expect(dialog).toBeHidden();

    await reviewSection.getByRole("button", { name: "確認する" }).click();
    for (const summary of await dialog
      .locator('section[aria-label="商品と割引"] details:not([open]) > summary')
      .all())
      await summary.click();
    await expect(dialog.getByRole("radio", { name: "すべて8%" })).toBeChecked({ timeout: 10_000 });
    await expect(dialog.getByLabel("レシートの金額", { exact: true })).not.toHaveValue("100", {
      timeout: 10_000,
    });
  });
});

test.describe("Issue #179 AI下書きからexpenseEntriesへ登録", () => {
  test.beforeEach(async () => {
    await cleanupE2eExpenseEntries();
    await cleanupAiExpenseQueue();
    await cleanupTestCategories();
  });

  test("@smoke registerReadyDraftsAsExpenseEntries でexpenseEntriesに登録できる", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue-expense-entries");

    await expect(page.getByText("Issue #179 E2E Test: Register as Expense Entries")).toBeVisible();
    await expect(page.getByTestId("auth-status")).toHaveText("ready");
    await expect(page.getByTestId("convex-status")).toHaveText("ready");

    const currentUserId = (await page.getByTestId("current-user-id").textContent())?.trim();
    expect(currentUserId).toBeTruthy();
    if (!currentUserId) {
      throw new Error("current authenticated user id is empty");
    }

    await cleanupE2eExpenseEntriesByUser(currentUserId);
    await cleanupAiExpenseQueueByUser(currentUserId);
    await cleanupTestCategoriesByUser(currentUserId);

    const { draftId } = await seedAiExpenseDraftForExpenseEntriesByUser(currentUserId);
    await page.goto(`/__e2e__/ai-expense-queue-expense-entries?draftId=${draftId}`);

    await expect(page.getByTestId("auth-status")).toHaveText("ready");
    await expect(page.getByTestId("convex-status")).toHaveText("ready");
    await expect(page.getByTestId("current-user-id")).toHaveText(currentUserId);
    await expect(page.getByTestId("draft-id")).toContainText(draftId);
    await expect(page.getByRole("button", { name: "下書きをexpenseEntriesに登録" })).toBeEnabled();
    await page.getByRole("button", { name: "下書きをexpenseEntriesに登録" }).click();

    await expect(page.getByTestId("error")).toHaveCount(0);
    await expect(page.getByTestId("result")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("registered-draft-count")).toHaveText("1");
    await expect(page.getByTestId("created-entry-count")).toHaveText("2");
    await expect
      .poll(async () => {
        const ids = (await page.getByTestId("created-entry-ids").textContent()) ?? "";
        return ids.split(",").filter(Boolean).length;
      })
      .toBe(2);
  });
});

test.describe("Issue #337 レシート入力UI改善の表示・操作回帰", () => {
  test("@smoke 一覧で状態サマリーと次の操作導線が表示される", async ({ page }) => {
    await page.setViewportSize({ width: 406, height: 687 });
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const statusSummary = page.locator(".ai-expense-queue-status-summary");
    await expect(statusSummary).toBeVisible();
    await expect(queue.getByText("登録できます 1件")).toBeVisible();
    await expect(queue.getByText("確認待ち 1件")).toBeVisible();
    await expect(queue.getByText("読み取り失敗 1件")).toBeVisible();
    await expect(queue.getByRole("button", { name: "画像を読み取る" })).toBeVisible();
    await expect(queue.getByText("撮影して、あとでまとめて確認できます。")).toHaveCount(0);

    await expect(
      queue.getByRole("region", { name: "確認待ち" }).getByRole("button", { name: "確認する" }),
    ).toBeVisible();
    await expect(
      queue.getByRole("region", { name: "登録できます" }).getByRole("button", { name: "登録する" }),
    ).toBeVisible();
    await expect(
      queue.getByRole("region", { name: "読み取り失敗" }).getByRole("button", { name: "再撮影" }),
    ).toBeVisible();

    await page.waitForTimeout(400);
    await expectLocatorInsideViewport(queue);
    await expectLocatorInsideViewport(statusSummary);
  });

  test("@smoke SP幅で簡潔な下書き詳細と修正導線が読める", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue?withItems=1");

    const queue = page.getByRole("region", { name: "レシート入力" });
    await queue
      .getByRole("region", { name: "確認待ち" })
      .getByRole("button", { name: "確認する" })
      .click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog.getByRole("heading", { name: "登録候補" })).toHaveCount(0);
    await expect(dialog.getByText(/パン.*円/).first()).toBeVisible();
    await expect(dialog.getByText(/胃薬.*円/).first()).toBeVisible();
    await expect(dialog.getByRole("region", { name: "商品と割引" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "この内容で保存" })).toBeVisible();
  });
});

test.describe("Issue #397 登録準備OK状態で再編集できる", () => {
  test("登録準備OKの下書きを再度編集して準備OKに戻せる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await reviewSection.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await dialog.getByLabel("店名・内容").fill("大阪市水道局 水道料金");
    await dialog.getByLabel("合計金額").fill("9160");
    await dialog.getByRole("button", { name: "この内容で保存" }).click();
    await expect(dialog).toBeHidden();

    const readySection = queue.getByRole("region", { name: "登録できます" });
    const editedReadyItem = readySection
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "大阪市水道局" });
    await expect(editedReadyItem).toBeVisible();

    await editedReadyItem.getByRole("button", { name: "修正する" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("店名・内容").fill("大阪市水道局 6月分");
    await dialog.getByLabel("合計金額").fill("9200");
    await dialog.getByRole("button", { name: "この内容で保存" }).click();

    await expect(dialog).toBeHidden();
    await expect(editedReadyItem.getByText("大阪市水道局 6月分")).toBeVisible();
    await expect(editedReadyItem.getByText("9,200円")).toBeVisible();
    await expect(editedReadyItem.getByRole("button", { name: "修正する" })).toBeVisible();
    await expect(editedReadyItem.getByRole("button", { name: "登録する" })).toBeVisible();
  });
});

test.describe("Issue #669 初心者向け税修正", () => {
  test("分からないを選ぶと追加の税入力なしで合計だけ保存できる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue?withItems=1");
    const queue = page.getByRole("region", { name: "レシート入力" });
    await queue
      .getByRole("region", { name: "確認待ち" })
      .getByRole("button", { name: "確認する" })
      .click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await dialog.getByRole("radio", { name: "分からない" }).first().check();
    await expect(dialog.getByText(/税を推測せず、レシート合計だけで保存します/)).toBeVisible();
    await expect(dialog.getByText(/履歴・予算・カテゴリ集計には使われません/)).toBeVisible();
    await expect(dialog.getByText("支払額：9,120円")).toBeVisible();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();

    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "大阪市水道局" });
    await expect(readyItem.getByText("合計だけで保存")).toBeVisible();
  });
});

test.describe("Issue #670 混在レシートの商品単位修正", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("PCで要確認商品だけを順番に修正し税率別集計を更新できる", async ({ page }) => {
    const userId = process.env.E2E_CLERK_USER_ID?.trim();
    if (!userId) {
      test.skip();
      return;
    }
    await gotoAuthenticated(page, INPUT_PATH);
    await waitForReceiptInputQueue(page);
    await seedMixedTaxReviewDraftByUser(userId);
    await page.reload();

    const queue = await waitForReceiptInputQueue(page);
    const item = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E混在税レビュー店" });
    await item.getByRole("button", { name: "確認する" }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await dialog.getByRole("radio", { name: "商品によって異なる" }).check();
    await dialog.getByRole("radio", { name: "8%と10%が混ざっている" }).check();

    await expect(dialog.getByRole("heading", { name: /商品と割引/ })).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(800);
    await expect(dialog.getByText(/パン.*円/).first()).toBeVisible();
    await dialog.getByRole("combobox", { name: "牛乳の税率" }).click();
    await page.getByRole("option", { name: "8%" }).click();
    await expect(
      dialog.getByRole("region", { name: "確認すること" }).getByText(/税率・税込／税抜/),
    ).toHaveCount(0);
    await expect(dialog.getByText("商品の税額：36円")).toBeVisible();
    await expect(dialog.getByText("商品合計：438円")).toBeVisible();
  });

  test("SPでレシート参照を開き、未解決のまま合計だけ保存できる", async ({ page }) => {
    const userId = process.env.E2E_CLERK_USER_ID?.trim();
    if (!userId) {
      test.skip();
      return;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAuthenticated(page, INPUT_PATH);
    await waitForReceiptInputQueue(page);
    await seedMixedTaxReviewDraftByUser(userId);
    await page.reload();

    const queue = await waitForReceiptInputQueue(page);
    const item = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E混在税レビュー店" });
    await item.getByRole("button", { name: "確認する" }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await dialog.getByRole("radio", { name: "商品によって異なる" }).check();
    await dialog.getByRole("radio", { name: "8%と10%が混ざっている" }).check();
    await dialog.getByText("読み取り原文・詳しい税情報（参考）", { exact: true }).click();

    await expect(dialog.getByRole("list", { name: "OCR原文" })).toContainText("牛乳 110円");
    await expectLocatorInsideViewport(dialog);
    await dialog.getByRole("radio", { name: "レシート合計だけ保存" }).check();
    await dialog.getByRole("button", { name: "レシート合計だけ保存" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      queue
        .getByRole("region", { name: "登録できます" })
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E混在税レビュー店" })
        .getByText("合計だけで保存"),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Issue #435 税率別集計の conflict 修正", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("税率別集計の矛盾を編集して保存すると下書きが再描画される", async ({ page }) => {
    if (!process.env.E2E_CLERK_USER_EMAIL) {
      test.skip();
      return;
    }

    await gotoAuthenticated(page, "/");
    const userId = await getCurrentClerkTokenIdentifier(page);
    await seedTaxSummaryConflictDraftByUser(userId);
    await page.goto(INPUT_PATH);

    const queue = await waitForReceiptInputQueue(page);
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("E2E税率別集計店")).toBeVisible({ timeout: 15_000 });
    await reviewSection.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();
    await dialog.getByText("読み取り原文・詳しい税情報（参考）", { exact: true }).click();

    const summarySection = dialog.getByLabel("税率別集計", { exact: true });
    await expect(summarySection).toBeVisible();
    await expect(
      dialog.getByText("内税として読み取りましたが、対象額は税抜として読み取られています"),
    ).toBeVisible();
    await expect(dialog.getByText("税込額と支払合計が一致しません")).toBeVisible();

    const taxableAmountInput = dialog.getByRole("spinbutton", { name: "対象額" });
    await expect(taxableAmountInput).toBeVisible();
    await taxableAmountInput.fill("1060");

    const basisSelect = dialog.getByRole("combobox", { name: "対象額種別" });
    await basisSelect.click();
    await page.getByRole("option", { name: "税込印字" }).click();

    const taxIncludedAmountInput = dialog.getByRole("spinbutton", { name: "税込合計" });
    await taxIncludedAmountInput.fill("1060");

    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "保存中…" })).toHaveCount(0, {
      timeout: 15_000,
    });

    await expect(
      dialog.getByText("内税として読み取りましたが、対象額は税抜として読み取られています"),
    ).toHaveCount(0);
    await expect(dialog.getByText("税込額と支払合計が一致しません")).toHaveCount(0);
    await expect(dialog.getByText("対象額 1,060円（税込）")).toBeVisible();
    await expect(dialog.getByText("税額 96円")).toBeVisible();
    await expect(dialog.getByText("税込合計 1,060円")).toBeVisible();

    await dialog.getByRole("button", { name: "この内容で保存" }).click();
    await expect(dialog).toBeHidden();

    const readySection = queue.getByRole("region", { name: "登録できます" });
    await readySection.getByRole("button", { name: "修正する" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByText("読み取り原文・詳しい税情報（参考）", { exact: true }).click();
    await expect(dialog.getByText("対象額 1,060円（税込）")).toBeVisible({ timeout: 10_000 });
  });
});
