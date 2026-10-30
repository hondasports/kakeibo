import { test, expect, type Locator, type Page } from "@playwright/test";
import { getCurrentClerkTokenIdentifier, gotoAuthenticated } from "./helpers/auth";
import {
  expectLocatorInsideContainer,
  expectLocatorInsideViewport,
  expectNoHorizontalOverflow,
} from "./helpers/viewport";
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
import { expandDetailsIfClosed, waitForReceiptInputQueue } from "./helpers/receiptQueue";

const INPUT_PATH = "/weeks/current/input";

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
    // 追加直後は2件とも解析待ち・解析中として「読み取り中」に並ぶ
    const processingSection = queue.getByRole("region", { name: "読み取り中" });
    await expect(processingSection).toBeVisible({ timeout: 15_000 });
    await expect(processingSection.getByText("2件")).toBeVisible();

    // 解析直後の下書きは常に user_confirmation_required で確認待ちになるため、
    // 2件とも「確認待ち」に並び登録準備OKは0件のまま確定する
    // 「確認待ち N件」は状態サマリーのチップとバッチ内訳の両方に出るため、
    // キュー状態の確認対象である状態サマリー側に絞る
    const statusSummary = queue.locator(".ai-expense-queue-status-summary");
    await expect(statusSummary.getByText("確認待ち 2件")).toBeVisible({ timeout: 30_000 });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText(`ai-queue-receipt-${stamp}.jpg`).first()).toBeVisible();
    await expect(reviewSection.getByText(`ai-queue-payment-${stamp}.jpg`).first()).toBeVisible();
    await expect(queue.getByText("今回の追加 0/2件が登録準備OK")).toBeVisible();
    await expect(queue.getByRole("button", { name: "まとめて登録（0件）" })).toBeDisabled();

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
});

test.describe("Issue #146 AI支出下書きの確認要否分類（/__e2e__/ fixture・サーバー保存なし）", () => {
  // 表示内容・操作可否は AiExpenseQueuePanel.display.test がカバーするため、
  // 実ブラウザ固有の capture 属性だけをここで確認する。
  test("失敗下書きの再撮影inputにcapture=environmentが付く", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    await expect(queue).toBeVisible();
    const failedSection = queue.getByRole("region", { name: "読み取り失敗" });
    await expect(failedSection.getByRole("button", { name: "再撮影" })).toBeEnabled();
    await expect(page.getByLabel("再撮影する画像を選択")).toHaveAttribute("capture", "environment");
  });
});

test.describe("Issue #148 確認が必要なAI支出下書きの編集導線（/__e2e__/ fixture・サーバー保存なし）", () => {
  test("確認が必要な下書きを編集して登録準備OKに戻せる", async ({ page }) => {
    await gotoAuthenticated(page, "/__e2e__/ai-expense-queue");

    const queue = page.getByRole("region", { name: "レシート入力" });
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("review-payment.png")).toBeVisible();

    await reviewSection.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("レシート全体の確認")).toBeVisible();
    // 店名は支払先名で補完されるため必須エラーは出ない。代わりに比較不能の案内を確認する。
    await expect(dialog.getByText("金額を比較できません")).toBeVisible();
    await dialog.getByText("読み取り原文（参考）", { exact: true }).click();
    await expect(dialog.getByRole("list", { name: "OCR原文" })).toContainText(
      "大阪市水道局 水道料金",
    );
    await expect(dialog.getByLabel("支出日（レシート記載日）")).toHaveValue("2026-06-01");
    await expect(dialog.getByLabel("合計金額")).toHaveValue("9120");
    await expect(dialog.getByLabel("店名・内容")).toHaveValue("大阪市水道局");

    await dialog.getByLabel("店名・内容").fill("大阪市水道局 水道料金");
    await dialog.getByLabel("合計金額").fill("9160");
    await dialog.getByRole("button", { name: "下書きを保存" }).click();

    await expect(dialog).toBeHidden();
    await expect(queue.getByText("確認待ち 0件")).toHaveCount(0);
    const readySection = queue.getByRole("region", { name: "登録できます" });
    await expect(readySection.getByText("大阪市水道局")).toBeVisible();
    await expect(readySection.getByText("2026/06/01 ・ 9,160円")).toBeVisible();
  });
});

test.describe("下書き確認の税状態保存", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("明細ごとの税修正を保存すると再オープン後も維持される", async ({ page }) => {
    await gotoAuthenticated(page, INPUT_PATH);
    const userId = await getCurrentClerkTokenIdentifier(page);
    await seedTaxReviewDraftByUser(userId);
    await page.reload();

    const queue = await waitForReceiptInputQueue(page);
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    const taxReviewItem = reviewSection
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税レビュー店" });
    await expect(taxReviewItem).toBeVisible({ timeout: 15_000 });
    await taxReviewItem.getByRole("button", { name: "確認する" }).click();

    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    // ダイアログ表示時の再解釈で税が解決済みの場合は行が畳まれているため、先に展開する
    const taxItemRow = dialog
      .locator('section[aria-label="商品一覧"] details')
      .filter({ hasText: "E2E税テスト商品" })
      .first();
    await expandDetailsIfClosed(taxItemRow);
    await expect(dialog.getByRole("region", { name: "確認件数" })).toContainText(
      "税の確認待ち 1件",
    );
    const checkSection = dialog.getByRole("region", { name: "確認結果" });
    await expect(
      checkSection.getByText("税設定・登録額の確認が必要な明細があるため、支払額と比較できません"),
    ).toBeVisible();
    await taxItemRow.getByRole("combobox", { name: "E2E税テスト商品の税率", exact: true }).click();
    await page.getByRole("option", { name: "非課税", exact: true }).click();
    await expect(dialog.getByText(/税率 0%/).first()).toBeVisible({ timeout: 15_000 });

    await dialog.getByLabel("レシートの金額", { exact: true }).fill("99");
    await expect(checkSection.getByText("差額", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "下書きを保存" }).click();
    await expect(dialog).toBeHidden();

    await reviewSection.getByRole("button", { name: "確認する" }).click();
    await expect(dialog).toBeVisible();
    const itemRow = dialog
      .locator('section[aria-label="商品一覧"] details')
      .filter({ hasText: "E2E税テスト商品" })
      .first();
    await expandDetailsIfClosed(itemRow);
    await expect(
      dialog.getByRole("combobox", { name: "E2E税テスト商品の税率", exact: true }),
    ).toHaveText("非課税", { timeout: 10_000 });
    await expect(
      dialog.getByRole("combobox", { name: "E2E税テスト商品の表示価格", exact: true }),
    ).toHaveText("税込");
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

test.describe("Issue #1123 AI下書き登録から週次サマリー", () => {
  test("@smoke キューから登録した下書きが週次サマリーに金額・件数・カテゴリで反映される", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoAuthenticated(page, INPUT_PATH);
    const userId = await getCurrentClerkTokenIdentifier(page);
    await cleanupE2eExpenseEntriesByUser(userId);
    await cleanupAiExpenseQueueByUser(userId);
    await cleanupTestCategoriesByUser(userId);
    try {
      await seedAiExpenseDraftForExpenseEntriesByUser(userId);
      await page.reload();
      const queue = await waitForReceiptInputQueue(page);
      const row = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2Eスーパー" });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText("1,500円");

      // seed 下書きを確認ダイアログで開いて保存する
      await row.getByRole("button", { name: "修正する", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "下書き確認" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("店名・内容")).toHaveValue("E2Eスーパー");
      await expect(dialog.getByLabel("合計金額", { exact: true })).toHaveValue("1500");
      await dialog.getByRole("button", { name: "下書きを保存", exact: true }).click();
      await expect(dialog).toBeHidden();

      // キューの「登録する」で支出エントリへ登録する
      await row.getByRole("button", { name: "登録する", exact: true }).click();
      await expect(row).toContainText("登録済み", { timeout: 20_000 });
      await expect(row).toContainText("1,500円");

      // seed 日付 2026-06-01（月曜）は既定の月曜始まりで /weeks/2026-06-01 の週に入る
      await page.goto("/weeks/2026-06-01");
      await expect(page).toHaveURL(/\/weeks\/2026-06-01$/);
      await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator('[aria-label="合計支出"]')).toContainText("1,500円");

      const categoryTable = page
        .getByTestId("weekly-category-breakdown")
        .getByRole("table", { name: "カテゴリ別内訳" });
      const foodRow = categoryTable
        .getByRole("row")
        .filter({ hasText: "E2Eカテゴリ-食費-Issue322" });
      await expect(foodRow.getByRole("cell").nth(1)).toHaveText("1,000円");
      await expect(foodRow.getByRole("cell").nth(3)).toHaveText("1件");
      const goodsRow = categoryTable
        .getByRole("row")
        .filter({ hasText: "E2Eカテゴリ-日用品-Issue322" });
      await expect(goodsRow.getByRole("cell").nth(1)).toHaveText("500円");
      await expect(goodsRow.getByRole("cell").nth(3)).toHaveText("1件");
      const totalRow = categoryTable.getByRole("row").filter({ hasText: "合計" });
      await expect(totalRow.getByRole("cell").nth(1)).toHaveText("1,500円");
      await expect(totalRow.getByRole("cell").nth(3)).toHaveText("2件");

      // 支出一覧は同じ下書き由来の1グループ・2明細になる
      const expenseList = page.getByRole("table", { name: "週次サマリーの支出一覧" });
      await expect(expenseList.getByTestId("receipt-group")).toHaveCount(1);
      await expect(expenseList).toContainText("E2Eスーパー");
      await expect(expenseList.getByTestId("receipt-row")).toHaveCount(2);
    } finally {
      await cleanupAiExpenseQueueByUser(userId);
      await cleanupE2eExpenseEntriesByUser(userId);
      await cleanupTestCategoriesByUser(userId);
    }
  });
});

test.describe("Issue #337 レシート入力UI改善の表示・操作回帰（/__e2e__/ fixture・サーバー保存なし）", () => {
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

    await expectLocatorInsideViewport(queue);
    await expectLocatorInsideViewport(statusSummary);
    const cameraButton = queue.getByRole("button", { name: "カメラで撮影" });
    const imageButton = queue.getByRole("button", { name: "画像を読み取る" });
    const failedChip = queue.getByText("読み取り失敗 1件");
    const registered = queue.getByRole("region", { name: "登録済み" });
    await expect(cameraButton).toBeVisible();
    await expect(registered).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectLocatorInsideViewport(cameraButton);
    await expectLocatorInsideViewport(imageButton);
    await expectLocatorInsideViewport(failedChip);
    await expectLocatorInsideViewport(registered);
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
    await expect(dialog.getByText("パン", { exact: true })).toBeVisible();
    await expect(dialog.getByText("胃薬", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("region", { name: "商品一覧" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "下書きを保存" })).toBeVisible();
  });
});

test.describe("Issue #670 混在レシートの商品単位修正", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("SPでレシート参照を開き、未解決のまま下書きを保存できる", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAuthenticated(page, INPUT_PATH);
    const userId = await getCurrentClerkTokenIdentifier(page);
    await waitForReceiptInputQueue(page);
    await seedMixedTaxReviewDraftByUser(userId);
    await page.reload();

    const queue = await waitForReceiptInputQueue(page);
    const item = queue.locator(".ai-expense-queue-item").filter({ hasText: "E2E混在税レビュー店" });
    await item.getByRole("button", { name: "確認する" }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    await dialog.getByText("読み取り原文（参考）", { exact: true }).click();

    await expect(dialog.getByRole("list", { name: "OCR原文" })).toContainText("牛乳 110円");
    await expectLocatorInsideViewport(dialog);
    await dialog.getByRole("button", { name: "下書きを保存" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      queue
        .getByRole("region", { name: "確認待ち" })
        .locator(".ai-expense-queue-item")
        .filter({ hasText: "E2E混在税レビュー店" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Issue #435 税率別集計の conflict 修正", () => {
  test.beforeEach(async () => {
    await cleanupAiExpenseQueue();
  });

  test("旧税内訳の矛盾は商品の税設定を確認して保存・再表示できる", async ({ page }) => {
    await gotoAuthenticated(page, "/");
    await seedTaxSummaryConflictDraftByUser(await getCurrentClerkTokenIdentifier(page));
    await page.goto(INPUT_PATH);
    const queue = await waitForReceiptInputQueue(page);
    const reviewSection = queue.getByRole("region", { name: "確認待ち" });
    await expect(reviewSection.getByText("E2E税率別集計店")).toBeVisible({ timeout: 15000 });
    await reviewSection.getByRole("button", { name: "確認する" }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    const product = dialog
      .getByRole("region", { name: "商品一覧" })
      .locator("details")
      .filter({ hasText: "E2E税率別集計商品" });
    await expandDetailsIfClosed(product);
    await product.getByRole("combobox", { name: "E2E税率別集計商品の税率", exact: true }).click();
    await page.getByRole("option", { name: "10%", exact: true }).click();
    await expect(
      product.getByRole("combobox", { name: "E2E税率別集計商品の税率", exact: true }),
    ).toBeEnabled();
    await product
      .getByRole("combobox", { name: "E2E税率別集計商品の表示価格", exact: true })
      .click();
    await page.getByRole("option", { name: "税込", exact: true }).click();
    await expect(dialog.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveCount(0);
    await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    const readyItem = queue
      .getByRole("region", { name: "登録できます" })
      .locator(".ai-expense-queue-item")
      .filter({ hasText: "E2E税率別集計店" });
    await expect(readyItem).toContainText("1,060円");
    await readyItem.getByRole("button", { name: "修正する", exact: true }).click();
    await expect(dialog.getByText("印字額と明細の金額が一致しています。")).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "対象額", exact: true })).toHaveCount(0);
  });
});
