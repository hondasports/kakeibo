import { test, expect, type Locator } from "@playwright/test";
import { barClasses } from "@mui/x-charts/BarChart";
import { gotoAuthenticated } from "./helpers/auth";
import { expectNoHorizontalOverflow } from "./helpers/viewport";
import {
  cleanupE2eExpenseEntries,
  cleanupTestCategories,
  cleanupTestReceipts,
  resetTestWeekSession,
} from "./helpers/cleanup";
import { addWeeks, getCurrentWeekStartDate } from "./helpers/currentPeriod";
import { saveExpense } from "./helpers/expenseEntry";

async function expectChartLabelsWithinBounds(graph: Locator) {
  await expect
    .poll(
      async () => {
        const graphBounds = await graph.boundingBox();
        return await graph.locator("svg text").evaluateAll((labels, bounds) => {
          if (!bounds) return ["グラフ領域を取得できません"];
          return labels.flatMap((label) => {
            const text = label.textContent?.trim();
            const rect = label.getBoundingClientRect();
            const isOutside =
              rect.left < bounds.x - 1 ||
              rect.right > bounds.x + bounds.width + 1 ||
              rect.top < bounds.y - 1 ||
              rect.bottom > bounds.y + bounds.height + 1;
            return text && isOutside ? [text] : [];
          });
        }, graphBounds);
      },
      { message: "グラフの軸ラベルが表示領域から見切れない", timeout: 5_000 },
    )
    .toEqual([]);
}

// ---------------------------------------------------------------------------
// ダッシュボード・認証確認
// ---------------------------------------------------------------------------

test.describe("メイン画面の表示確認", () => {
  test("@smoke @staging シナリオ2: ログイン済みでアクセスするとダッシュボードが表示される", async ({
    page,
  }) => {
    await gotoAuthenticated(page);

    // Issue #49: ダッシュボードに変更
    await expect(page.getByRole("heading", { name: "今週のダッシュボード" })).toBeVisible();
    // summary-grid の主要カード
    await expect(page.locator(".dashboard-summary-panel").getByText("今週の支出")).toBeVisible();
  });

  test("@smoke シナリオ3: ページリロードしてもログイン状態が維持される", async ({ page }) => {
    await gotoAuthenticated(page);
    await expect(page.locator("text=今週のダッシュボード")).toBeVisible();

    await page.reload();

    await expect(page.locator("text=今週のダッシュボード")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 支出項目保存フロー（Issue #13 / #181）
// ---------------------------------------------------------------------------

test.describe("支出項目保存フロー（Issue #13 / #181 受け入れ確認）", () => {
  test.beforeEach(async ({ page }) => {
    // 入力フォームは /weeks/current/input にある
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  // テスト中に作成した支出項目を Dev DB から削除してゴミを防ぐ
  test.afterEach(async () => {
    await cleanupTestReceipts();
    await cleanupTestCategories();
  });

  test("@smoke シナリオ5: 必須項目を入力して保存すると店名・金額がクリアされる", async ({
    page,
  }) => {
    // Issue #181: ReceiptForm → ExpenseEntryForm に変更
    const shopNameInput = page.getByLabel("店舗名 / 支払先");
    const amountInput = page.getByLabel("合計金額");

    await shopNameInput.fill("スーパー北浜");
    await amountInput.fill("4280");
    // カテゴリを選択（最初のカテゴリボタンをクリック）
    await page
      .locator('[role="listbox"][aria-label="カテゴリ候補"] [role="option"]')
      .first()
      .click();

    await page.getByRole("button", { name: "保存して次へ" }).click();

    // 店名・金額がクリアされることを確認（保存完了の主要確認）
    await expect(shopNameInput).toHaveValue("", { timeout: 15_000 });
    await expect(amountInput).toHaveValue("");

    // Snackbar で成功通知が出ることを確認（Issue #13 / #181）
    // フォームリセット完了後でも Snackbar は 3 秒以内なら表示されているはず
    const snackbar = page.getByRole("alert").filter({ hasText: "支出項目を保存しました" });
    await expect(snackbar).toBeVisible({ timeout: 3_000 });
  });

  test("[Issue #13] カテゴリが保存後も引き継がれる", async ({ page }) => {
    // Issue #181: 日付は週日選択UIに変更。カテゴリ引き継ぎのみ確認
    // 最初のカテゴリを選択して保存する
    await saveExpense(page, "テスト店舗", "500");

    // カテゴリが引き継がれている（aria-selected="true" のオプションが存在する）
    await expect(
      page.locator('[role="listbox"][aria-label="カテゴリ候補"] [aria-selected="true"]'),
    ).toBeVisible();
  });

  test("[Issue #13] 5件連続入力して操作が止まらない", async ({ page }) => {
    const submitButton = page.getByRole("button", { name: "保存して次へ" });

    const shops = ["店舗A", "店舗B", "店舗C", "店舗D", "店舗E"];
    const amounts = ["100", "200", "300", "400", "500"];

    for (let i = 0; i < 5; i++) {
      await saveExpense(page, shops[i], amounts[i]);
    }

    // 5件入力後もフォームが使用可能であることを確認
    await expect(submitButton).toBeEnabled();
  });

  test("@smoke @staging シナリオ6: 保存後に支出一覧に追加される", async ({ page }) => {
    // 1件目を保存
    await saveExpense(page, "スーパー北浜", "4280");

    // 2件目を保存
    await saveExpense(page, "ドラッグストア", "1540");

    // Issue #77: InputPage から WeekStatusPanel（直近の入力一覧）が削除されたため、
    // SummaryPage（週次サマリー）で支出一覧を確認する
    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    // 支出一覧に追加されていることを確認（表示順は問わない）
    const receiptList = page.getByTestId("receipt-row");
    await expect(receiptList.filter({ hasText: "ドラッグストア" }).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await receiptList.count()).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// バリデーション（P1）
// ---------------------------------------------------------------------------

test.describe("バリデーション（P1）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  test("シナリオ9: カテゴリ候補が表示される（デフォルト選択あり）", async ({ page }) => {
    // Issue #181: ExpenseEntryForm ではカテゴリはデフォルト選択済み
    // カテゴリ候補UIが表示されていることを確認
    await expect(page.getByRole("button", { name: "保存して次へ" })).toBeVisible();
    await expect(page.locator('[role="listbox"][aria-label="カテゴリ候補"]')).toBeVisible();
    // デフォルトで1件選択済みであること
    await expect(
      page.locator('[role="listbox"][aria-label="カテゴリ候補"] [aria-selected="true"]'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// カテゴリ管理（Issue #17）
// ---------------------------------------------------------------------------

test.describe("[Issue #17] カテゴリ管理の反映確認（P1 / regression）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  test.afterEach(async () => {
    await cleanupTestReceipts();
    await cleanupTestCategories();
  });

  test("シナリオ16: 追加・編集・無効化が入力候補と既存表示に反映される", async ({ page }) => {
    const stamp = Date.now();
    const categoryName = `E2Eカテゴリ-${stamp}`;
    const updatedCategoryName = `${categoryName}-更新`;
    const shopName = `E2Eカテゴリ店舗-${stamp}`;

    // カテゴリ設定は BottomNav「設定」タブ → /settings へ遷移
    // SettingsPage には CategorySettingsPanel が含まれている
    await page.getByRole("link", { name: "設定" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByRole("heading", { name: "カテゴリ", level: 2 })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "カテゴリ 食費" })).toBeVisible();

    await page.getByRole("button", { name: "カテゴリを追加" }).click();
    await page.locator('input[name="newCategoryColor"]').fill("#2563eb");
    const newCategoryNameInput = page.locator('input[name="newCategoryName"]');
    await newCategoryNameInput.click();
    await newCategoryNameInput.pressSequentially(categoryName);
    await expect(newCategoryNameInput).toHaveValue(categoryName);
    await page.getByRole("button", { name: "追加する" }).click();
    await expect(page.getByRole("listitem", { name: `カテゴリ ${categoryName}` })).toBeVisible();

    await page.getByRole("button", { name: `${categoryName}を編集` }).click();
    const editCategoryNameInput = page.locator('input[name="editCategoryName"]');
    await editCategoryNameInput.clear();
    await editCategoryNameInput.pressSequentially(updatedCategoryName);
    await page.locator('input[name="editCategoryColor"]').fill("#0f766e");
    await page
      .getByRole("listitem", { name: `カテゴリ ${categoryName}` })
      .getByRole("button", { name: "変更を保存" })
      .click();
    await expect(
      page.getByRole("listitem", { name: `カテゴリ ${updatedCategoryName}` }),
    ).toBeVisible();

    // 入力画面に戻る
    await page.getByRole("link", { name: "入力", exact: true }).click();
    await expect(page).toHaveURL("/weeks/current/input");
    const updatedCategoryOption = page
      .locator('[role="listbox"][aria-label="カテゴリ候補"] [role="option"]')
      .filter({ hasText: updatedCategoryName });
    await expect(updatedCategoryOption).toBeVisible();

    // Issue #181: ExpenseEntryForm セレクターに変更して支出項目を保存
    await updatedCategoryOption.click();
    await page.getByLabel("店舗名 / 支払先").fill(shopName);
    await page.getByLabel("合計金額").fill("1000");
    await page.getByRole("button", { name: "保存して次へ" }).click();
    await expect(page.getByLabel("店舗名 / 支払先")).toHaveValue("", { timeout: 10_000 });

    // 無効化（設定画面に戻る）
    // SettingsPage には CategorySettingsPanel が含まれている
    await page.getByRole("link", { name: "設定" }).click();
    await expect(page).toHaveURL("/settings");
    await page.getByRole("button", { name: `${updatedCategoryName}を編集` }).click();
    await page.getByRole("button", { name: `${updatedCategoryName}を無効化` }).click();
    // 無効化後: ボタンが disabled になること（設定画面では無効カテゴリも表示される）
    await expect(page.getByRole("button", { name: `${updatedCategoryName}を無効化` })).toBeDisabled(
      { timeout: 15_000 },
    );

    // 入力画面でカテゴリ候補から消えていることを確認
    await page.getByRole("link", { name: "入力", exact: true }).click();
    await expect(page).toHaveURL("/weeks/current/input");
    await expect(updatedCategoryOption).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 入力状況パネル（Issue #14）— PC幅のみ存在
// ---------------------------------------------------------------------------

test.describe("[Issue #14] 入力状況パネルの表示確認（P0 / smoke）", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await cleanupTestReceipts();
    await cleanupE2eExpenseEntries();
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  test.afterEach(async () => {
    await cleanupTestReceipts();
    await cleanupE2eExpenseEntries();
  });

  test("@smoke [Issue #14] 入力画面の主要セクションが表示される", async ({ page }) => {
    // Issue #181: ReceiptForm → ExpenseEntryForm に変更。収入タブは廃止
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await expect(page.getByLabel("店舗名 / 支払先")).toBeVisible();
    await expect(page.getByLabel("合計金額")).toBeVisible();
    await expect(page.locator('[role="listbox"][aria-label="週内の日付候補"]')).toBeVisible();
    await expect(page.locator('[role="listbox"][aria-label="カテゴリ候補"]')).toBeVisible();
  });

  test('[Issue #14] 空状態で "まだレシートがありません" が表示される', async ({ page }) => {
    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();
    await expect(page.getByTestId("receipt-row")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("まだレシートがありません").first()).toBeVisible();
  });

  test("[Issue #14] ダッシュボードに今週の支出カウンターが表示される", async ({ page }) => {
    await page.getByRole("link", { name: "ホーム" }).click();
    await expect(page).toHaveURL("/");
    const spendCard = page.locator(".dashboard-summary-panel").filter({ hasText: "今週の支出" });
    await expect(spendCard.locator("[data-value]").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 保存後のリアルタイム更新確認（Issue #14）— PC幅で DashboardPage / WeekStatusPanel を確認
// ---------------------------------------------------------------------------

test.describe("[Issue #14] 保存後のリアルタイム更新確認（P0 / 完了条件）", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/weeks/current/input");
    await cleanupTestReceipts({ page });
    await cleanupE2eExpenseEntries({ page });
    await resetTestWeekSession(getCurrentWeekStartDate(), { page });
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    // expenseEntries の cleanup が反映されるまで待機
    await expect(page.getByTestId("receipt-row")).toHaveCount(0, { timeout: 15_000 });
  });

  // テスト中に作成したレシートを Dev DB から削除してゴミを防ぐ
  test.afterEach(async ({ page }) => {
    await cleanupTestReceipts({ page });
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestCategories({ page });
  });

  test("@smoke [Issue #14/#15] 保存した支出が週次サマリーに店名・金額・件数で反映される", async ({
    page,
  }) => {
    const shopName = `QAサマリー反映_${Date.now()}`;

    await saveExpense(page, shopName, "1234");

    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "カテゴリ別" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "支出一覧" })).toBeVisible();
    const receiptRows = page.getByTestId("receipt-row");
    const savedRow = receiptRows.filter({ hasText: shopName });
    await expect(savedRow).toHaveCount(1, { timeout: 15_000 });
    await expect(savedRow.first()).toContainText("1,234円");
    // beforeEach で支出を空にしているため、今週の行は保存した1件だけ
    await expect(receiptRows).toHaveCount(1);
  });

  test("[Issue #359] 3行以上のメモは省略表示し、展開と折りたたみを切り替えられる", async ({
    page,
  }) => {
    const shopName = `QAメモ359_${Date.now()}`;
    const multiLineMemo = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ"].join("\n");

    await saveExpense(page, shopName, "1500", { memo: multiLineMemo });

    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });

    const receiptRow = page.getByTestId("receipt-row").filter({ hasText: shopName }).first();
    const memoContent = receiptRow.getByTestId("memo-expandable-content");
    const toggle = receiptRow.getByTestId("memo-expand-toggle");
    await expect(receiptRow).toBeVisible({ timeout: 15_000 });
    await expect(memoContent).toContainText("あ");
    await expect(memoContent).toContainText("こ");
    await expect(toggle).toHaveText("もっと見る");

    await toggle.click();
    await expect(toggle).toHaveText("閉じる");
    await toggle.click();
    await expect(toggle).toHaveText("もっと見る");
  });

  test("[Issue #359] 40文字超の1行メモも折り返し時は展開と折りたたみを切り替えられる", async ({
    page,
  }) => {
    const shopName = `QAメモ359wrap_${Date.now()}`;
    const wrappedMemo = "メモ確認用の長文テスト。".repeat(8);

    await saveExpense(page, shopName, "1600", { memo: wrappedMemo });

    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });

    const receiptRow = page.getByTestId("receipt-row").filter({ hasText: shopName }).first();
    const toggle = receiptRow.getByTestId("memo-expand-toggle");

    await expect(receiptRow).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveText("もっと見る");

    await toggle.click();
    await expect(toggle).toHaveText("閉じる");
    await toggle.click();
    await expect(toggle).toHaveText("もっと見る");
    await toggle.click();
    await expect(toggle).toHaveText("閉じる");
    await toggle.click();
    await expect(toggle).toHaveText("もっと見る");
  });

  test("[Issue #308] 保存後も入力画面に直近の入力一覧を表示しない", async ({ page }) => {
    const shopName = `QA入力画面確認_${Date.now()}`;

    await saveExpense(page, shopName, "1500");

    await expect(page.getByRole("heading", { name: "直近の入力" })).toHaveCount(0);
    await expect(page.getByText(shopName)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 週次サマリーページ（Issue #15）— /weeks/YYYY-MM-DD に直接遷移
// ---------------------------------------------------------------------------

test.describe("週次サマリーパネル（Issue #15 受け入れ確認）", () => {
  test.afterEach(async () => {
    await cleanupTestReceipts();
  });

  test("@smoke [Issue #309] 週次サマリーに振り返りと完了操作を表示しない", async ({ page }) => {
    const weekStartDate = getCurrentWeekStartDate();
    await gotoAuthenticated(page, `/weeks/${weekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "週次振り返り" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "セッションを完了" })).toHaveCount(0);
  });

  test("@smoke [Issue #15] 週次サマリーページに遷移できる (P0 / smoke)", async ({ page }) => {
    // Issue #49: Drawer の「履歴」リンクから週次サマリーへ遷移する
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();

    // Drawer の「履歴」リンクをクリックして週次サマリーへ遷移
    await page.getByRole("link", { name: "履歴" }).click();

    // SummaryPage に遷移する
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "カテゴリ別" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "支出一覧" })).toBeVisible();
  });

  test("[Issue #15] 空状態でレシート0件の表示が正しい (P0 / smoke)", async ({ page }) => {
    const weekStartDate = getCurrentWeekStartDate();
    await gotoAuthenticated(page, `/weeks/${weekStartDate}`);

    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    // 合計支出セクションが表示されること
    await expect(page.getByText("合計支出")).toBeVisible({ timeout: 15_000 });
  });

  test("[Issue #371] 週次サマリーがPC表形式とSP縦積み表示に切り替わる", async ({ page }) => {
    const shopName = `QA週次サマリー371_${Date.now()}`;
    const memo = ["週末のまとめ買い", "牛乳とパン", "特売品を含む"].join("\n");

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAuthenticated(page, "/weeks/current/input");
    await saveExpense(page, shopName, "5280", { memo });

    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();
    await expect(page.getByText("合計支出")).toBeVisible();
    await expect(page.getByText("前週差")).toBeVisible();
    await expect(page.getByText("2週平均比")).toBeVisible();

    const analysisGrid = page.locator(".weekly-summary-analysis-grid");
    const chartPanel = analysisGrid.locator(".paper-panel").first();
    const categoryPanel = analysisGrid.getByTestId("weekly-category-breakdown");
    await expect(chartPanel).toBeVisible();
    await expect(categoryPanel).toBeVisible();
    const [chartBounds, categoryBounds] = await Promise.all([
      chartPanel.boundingBox(),
      categoryPanel.boundingBox(),
    ]);
    expect(Math.abs((chartBounds?.y ?? 0) - (categoryBounds?.y ?? 0))).toBeLessThan(2);
    expect(chartBounds?.x ?? 0).toBeLessThan(categoryBounds?.x ?? 0);

    for (const label of ["日付", "店名・内訳", "金額（円）", "メモ", "操作"]) {
      await expect(page.locator(".receipt-list-header").getByText(label)).toBeVisible();
    }
    await expect(page.locator(".receipt-list-header").getByText("カテゴリ")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".receipt-list-header")).toBeHidden();
    await expectNoHorizontalOverflow(page);

    const mobileChartBounds = await chartPanel.boundingBox();
    const mobileCategoryBounds = await categoryPanel.boundingBox();
    expect(mobileChartBounds?.y ?? 0).toBeLessThan(mobileCategoryBounds?.y ?? 0);
    const receiptRow = page.getByTestId("receipt-row").filter({ hasText: shopName });
    await expect(receiptRow).toBeVisible();
    await expect(receiptRow.getByText("5,280円")).toBeVisible();
    const editButton = receiptRow.getByRole("button", { name: new RegExp(`${shopName}.*を編集`) });
    const deleteButton = receiptRow.getByRole("button", {
      name: new RegExp(`${shopName}.*を削除`),
    });
    for (const button of [editButton, deleteButton]) {
      const bounds = await button.boundingBox();
      expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(receiptRow.getByRole("button", { name: "もっと見る" })).toBeVisible();
  });

  test("[Issue #15] 再度ナビで戻れる (P1)", async ({ page }) => {
    const weekStartDate = getCurrentWeekStartDate();
    await gotoAuthenticated(page, `/weeks/${weekStartDate}`);

    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    // ナビで戻る
    await page.getByRole("link", { name: "入力", exact: true }).click();
    await expect(page).toHaveURL("/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  test("@smoke [Issue #45] 週次サマリーを前後週ナビゲーションで切り替えられる", async ({
    page,
  }) => {
    const currentWeekStartDate = getCurrentWeekStartDate();
    const previousWeekStartDate = addWeeks(currentWeekStartDate, -1);

    await gotoAuthenticated(page, `/weeks/${currentWeekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    // getFourWeeksSummary クエリロード完了を待機（グラフかプレースホルダーのどちらかが出るまで）
    await expect(
      page
        .getByRole("img", { name: "週別支出推移グラフ" })
        .or(page.getByText("週別の支出データがあると表示されます")),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "次の週へ" })).toBeDisabled();

    await page.getByRole("button", { name: "前の週へ" }).click();

    await expect(page).toHaveURL(new RegExp(`/weeks/${previousWeekStartDate}$`));
    await expect(page.getByRole("button", { name: "次の週へ" })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "週次振り返り" })).toHaveCount(0);
  });

  test("@smoke [Issue #45] 未来週URLは今週の週次サマリーへ正規化される", async ({ page }) => {
    const currentWeekStartDate = getCurrentWeekStartDate();
    const futureWeekStartDate = addWeeks(currentWeekStartDate, 1);

    // 認証してから未来週 URL にアクセスする（page.goto だと認証なしになるため）
    await gotoAuthenticated(page, `/weeks/${futureWeekStartDate}`);

    // weekSession の初期化完了 + URL 正規化を待つ
    await expect(page).toHaveURL(new RegExp(`/weeks/${currentWeekStartDate}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "次の週へ" })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 前週比表示（Issue #46）
// ---------------------------------------------------------------------------

test.describe("[Issue #371] 前週差表示（P1 / regression）", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async () => {
    await cleanupTestReceipts();
    await cleanupE2eExpenseEntries();
  });

  test.afterEach(async () => {
    await cleanupTestReceipts();
    await cleanupE2eExpenseEntries();
  });

  test("週次サマリーに前週差（円）が表示される", async ({ page }) => {
    // Issue #181: ExpenseEntryForm の日付は週日選択UI（今週内のみ）のため、
    // 前週データは「前の週へ」ナビゲート後に保存し、今週へ戻って今週分を保存する

    // まず前の週に移動して保存
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "前の週へ" }).click();
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await saveExpense(page, "前週比較用ストア", "7000");

    // 今週に戻って保存
    await page.getByRole("button", { name: "次の週へ" }).click();
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await saveExpense(page, "今週比較用ストア", "6280");

    // SummaryPage で前週比を確認（Issue #77: ReviewMemoPanel は InputPage から SummaryPage に移動）
    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    // Issue #371: SummaryPageでは前週比（指数）ではなく前週差（円）を表示する
    // 今週 6,280円 - 前週 7,000円 = -720円（formatSignedAmount のマイナスは U+2212）
    await expect(page.getByLabel("前週差")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("前週差")).toContainText("−720円");
    // 前週の 7,000円 はカテゴリ別支出・支出一覧には表示されない（グラフバーラベルを除く）
    const categorySection = page.getByTestId("weekly-category-breakdown");
    // AnimatedCounter導入により「7,000」と「円」が別要素になるため、部分一致で検索
    // 単語境界\bを使って「17,000」などに誤マッチしないよう堅牢化 (レビュー指摘対応)
    await expect(categorySection.getByText(/\b7,000\b/)).toHaveCount(0);
    const receiptListSection = page.getByLabel("週次サマリーの支出一覧");
    await expect(receiptListSection.getByText(/\b7,000\b/)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 週別支出推移グラフ（Issue #47, #232）
// ---------------------------------------------------------------------------

test.describe("週別支出推移グラフ（Issue #47, #232）", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.afterEach(async ({ page }) => {
    await cleanupTestReceipts({ page });
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestCategories({ page });
    await resetTestWeekSession(getCurrentWeekStartDate(), { page });
  });

  test("[Issue #47] 週次サマリーページに週別支出推移セクションが表示される", async ({ page }) => {
    const weekStartDate = getCurrentWeekStartDate();
    await gotoAuthenticated(page, `/weeks/${weekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    // Then: 週別支出推移セクションが表示される（グラフまたはプレースホルダー）
    await expect(page.getByRole("heading", { name: "週別支出推移" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("[Issue #232] 支出データがあると週別棒グラフが表示される @smoke", async ({ page }) => {
    // グラフ描画に必要な支出を今週分として保存する
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await saveExpense(page, "週別推移用ストア", "3000");

    const weekStartDate = getCurrentWeekStartDate();
    await page.goto(`/weeks/${weekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    await expect(page.getByRole("img", { name: "週別支出推移グラフ" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("週別の支出データがあると表示されます")).toHaveCount(0);
  });

  test("[Issue #47] ダッシュボードに前週比較グラフが表示される", async ({ page }) => {
    // 比較グラフの描画には前週の支出が必須なため、前週分を保存しておく
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "前の週へ" }).click();
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await saveExpense(page, "前週比較用ストア", "7000");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "今週のダッシュボード" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "前週との比較", level: 2 })).toBeVisible();
    await expect(page.getByRole("img", { name: "前週との比較グラフ" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("前週との比較データがあると表示されます")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "週別支出推移グラフ" })).not.toBeVisible();
  });

  test("[Issue #371] 前週差テキストが表示される", async ({ page }) => {
    const weekStartDate = getCurrentWeekStartDate();
    await gotoAuthenticated(page, `/weeks/${weekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    await expect(page.getByLabel("前週差")).toBeVisible({ timeout: 15_000 });
  });

  test("[Issue #232] 週別棒グラフに対象週の要約とTooltipが表示される", async ({ page }) => {
    // グラフ描画に必要な支出を今週分として保存する
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await saveExpense(page, "週別推移用ストア", "3000");

    const weekStartDate = getCurrentWeekStartDate();
    await page.goto(`/weeks/${weekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    const graph = page.getByRole("img", { name: "週別支出推移グラフ" });
    await expect(graph).toBeVisible({ timeout: 20_000 });

    // データがある場合はグラフだけでなく上部3指標も読める
    await expect(page.getByText("合計支出")).toBeVisible();
    await expect(page.getByText("2週平均比")).toBeVisible();
    await expectChartLabelsWithinBounds(graph);
    const bar = graph.locator(`.${barClasses.element}`).last();
    await expect(bar).toBeVisible();
    await bar.hover();
    await expect(page.getByText(/支出合計 .*円/).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBar = graph.locator(`.${barClasses.element}`).last();
    await expect(mobileBar).toBeVisible();
    await expectChartLabelsWithinBounds(graph);
    await mobileBar.click();
    await expect(page.getByText(/支出合計 .*円/).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 入力画面リニューアル（Issue #77）
// ---------------------------------------------------------------------------

test.describe("入力画面リニューアル（Issue #77 受け入れ確認）", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupTestReceipts();
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestReceipts({ page });
  });

  test("@smoke [Issue #392] 支出タブと収入タブが表示される", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "支出" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "収入" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "支出" })).toHaveAttribute("aria-selected", "true");
  });

  test("@smoke [Issue #392] 収入タブでは支出専用項目と画像操作を表示しない", async ({ page }) => {
    await page.getByRole("tab", { name: "収入" }).click();
    await expect(page.getByRole("tab", { name: "収入" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("金額")).toBeVisible();
    await expect(page.getByLabel("収入の内容・メモ")).toBeVisible();
    await expect(page.getByLabel("店舗名 / 支払先")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "画像を読み取る" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "カテゴリ別の内訳を追加" })).toHaveCount(0);
    await expect(page.getByRole("listbox", { name: "カテゴリ候補" })).toHaveCount(0);
  });

  test("[Issue #392] 収入を日付・金額・内容で保存できる", async ({ page }) => {
    await page.getByRole("tab", { name: "収入" }).click();
    await expect(page.getByRole("tab", { name: "収入" })).toHaveAttribute("aria-selected", "true");
    const dateListbox = page.getByRole("listbox", { name: "週内の日付候補" });
    await expect(dateListbox).toBeVisible();
    const selectedDay = dateListbox.locator('[role="option"][aria-selected="true"]');
    await expect(selectedDay).toHaveCount(1);
    await page.getByLabel("金額").fill("50,000");
    await page.getByLabel("収入の内容・メモ").fill(`立替精算_${Date.now()}`);
    await page.getByRole("button", { name: "保存して次へ" }).click();

    const snackbar = page.getByRole("alert").filter({ hasText: "収入を保存しました" });
    await expect(snackbar).toBeVisible();
    await expect(page.getByLabel("金額")).toHaveValue("", { timeout: 10_000 });
    await expect(page.getByLabel("収入の内容・メモ")).toHaveValue("");
    await expect(selectedDay).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "収入" })).toHaveAttribute("aria-selected", "true");
  });

  test("@smoke [Issue #378/#395] 収入保存後にダッシュボードと週次サマリーへ反映される", async ({
    page,
  }) => {
    await cleanupE2eExpenseEntries({ page });
    const incomeAmount = 77_777;
    const incomeTitle = `E2E収入_${Date.now()}`;
    const weekStartDate = getCurrentWeekStartDate();

    await page.getByRole("tab", { name: "収入" }).click();
    await page.getByLabel("金額").fill(String(incomeAmount));
    await page.getByLabel("収入の内容・メモ").fill(incomeTitle);
    await page.getByRole("button", { name: "保存して次へ" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "収入を保存しました" })).toBeVisible();

    await page.goto("/");
    await expect(page.locator(".dashboard-summary-panel").getByText("今週の収入")).toBeVisible();
    await expect
      .poll(
        async () => {
          const block = page.locator(".dashboard-summary-metric").filter({ hasText: "今週の収入" });
          const text = await block.textContent();
          return Number(text?.replace(/[^\d]/g, "") ?? 0);
        },
        { timeout: 15_000 },
      )
      .toBe(incomeAmount);

    await page.goto(`/weeks/${weekStartDate}`);
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();
    await expect(page.getByText(incomeTitle)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () => {
          const text = await page.getByLabel("合計収入").textContent();
          return Number(text?.replace(/[^\d]/g, "") ?? 0);
        },
        { timeout: 15_000 },
      )
      .toBe(incomeAmount);
    await expect(page.getByRole("heading", { name: /収入一覧/ })).toBeVisible();
  });

  test("@smoke [Issue #77] 週ナビゲーターが表示される", async ({ page }) => {
    // 週ナビゲーターの前週ボタン・次週ボタンが表示される
    await expect(page.getByRole("button", { name: "前の週へ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "次の週へ" })).toBeVisible();
    // 今週は次の週へボタンが無効
    await expect(page.getByRole("button", { name: "次の週へ" })).toBeDisabled();
  });

  test("[Issue #77] 前の週へナビゲートできる", async ({ page }) => {
    const currentWeekStartDate = getCurrentWeekStartDate();
    const previousWeekStartDate = addWeeks(currentWeekStartDate, -1);

    await page.getByRole("button", { name: "前の週へ" }).click();

    // 前週に移動したので「次の週へ」ボタンが有効になる
    await expect(page.getByRole("button", { name: "次の週へ" })).toBeEnabled({ timeout: 5_000 });
    // 前週の年をテキストで確認（WeekNavigator が "YYYY年..." 形式で表示する）
    const prevYear = previousWeekStartDate.substring(0, 4);
    await expect(page.getByText(new RegExp(`${prevYear}年`))).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// 複数カテゴリ別支出項目入力フロー（Issue #102 受け入れ確認）
// ---------------------------------------------------------------------------

/**
 * Issue #102 M18 受け入れ確認 E2E テスト
 *
 * M18 の子 Issue (#176, #177, #178, #179, #180, #181, #173, #175) が全て完了したことを受け、
 * 「入力元からカテゴリ別支出項目を作成・集計できること」を E2E で確認する。
 *
 * QA P0 要件:
 *   - 1つの入力元から複数のカテゴリ別支出項目を作成できる
 *   - 入力元合計と支出項目合計の差額を確認できる
 *   - 複数カテゴリ別支出がカテゴリ別集計と支出一覧に反映される
 *
 * 実装: src/features/expense-entry/hooks/useExpenseEntryForm.ts (isMultiMode, difference)
 *       src/features/expense-entry/components/ExpenseEntryForm.tsx (ExpenseItemRow, DifferenceDisplay)
 *       convex/expenseEntries.ts (createExpenseEntries)
 */
test.describe("複数カテゴリ別支出項目入力フロー（Issue #102 受け入れ確認）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/weeks/current/input");
    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
  });

  test.afterEach(async () => {
    await cleanupE2eExpenseEntries();
    await cleanupTestReceipts();
  });

  test("@smoke [Issue #102] 1つの入力元から複数カテゴリ別支出項目を保存できる", async ({
    page,
  }) => {
    // 店舗名と合計金額を入力
    await page.getByLabel("店舗名 / 支払先").fill("テストスーパー");
    await page.getByLabel("合計金額").fill("5000");

    // 複数項目モードに切り替える
    await page.getByRole("button", { name: "カテゴリ別の内訳を追加" }).click();

    // 複数モードに切り替わったことを確認（入力元合計ヘッダーと金額が表示される）
    await expect(page.getByText("入力元合計")).toBeVisible();
    await expect(page.getByText("5,000円", { exact: true })).toBeVisible();

    // 項目1: 内容をクリアして「食料品」、3,000円
    const item0 = page.getByTestId("expense-item-0");
    await item0.getByLabel("内容").clear();
    await item0.getByLabel("内容").fill("食料品");
    await item0.getByLabel("金額").fill("3000");
    await item0.getByRole("option").first().click();

    // 項目2 を追加して「日用品」、2,000円
    await page.getByRole("button", { name: "項目を追加" }).click();
    const item1 = page.getByTestId("expense-item-1");
    await item1.getByLabel("内容").fill("日用品");
    await item1.getByLabel("金額").fill("2000");
    // 2つ以上のカテゴリがあれば2番目を選択、なければ最初のカテゴリを選択
    const item1Options = item1.getByRole("option");
    if ((await item1Options.count()) >= 2) {
      await item1Options.nth(1).click();
    } else {
      await item1Options.first().click();
    }

    // 差額 0円 → 「配分完了」が表示されることを確認
    await expect(page.getByText("配分完了")).toBeVisible();

    // 保存
    await page.getByRole("button", { name: "保存して次へ" }).click();

    // 成功通知が表示される
    const snackbar = page.getByRole("alert").filter({ hasText: "支出項目を保存しました" });
    await expect(snackbar).toBeVisible({ timeout: 15_000 });

    // フォームがリセットされ単一モードに戻る
    await expect(page.getByLabel("店舗名 / 支払先")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("店舗名 / 支払先")).toHaveValue("");
  });

  test("[Issue #102] 複数カテゴリ別支出がカテゴリ別集計と支出一覧に反映される", async ({
    page,
  }) => {
    // 複数項目で保存
    await page.getByLabel("店舗名 / 支払先").fill("テストスーパー");
    await page.getByLabel("合計金額").fill("5000");
    await page.getByRole("button", { name: "カテゴリ別の内訳を追加" }).click();

    const item0 = page.getByTestId("expense-item-0");
    await item0.getByLabel("内容").clear();
    await item0.getByLabel("内容").fill("食料品");
    await item0.getByLabel("金額").fill("3000");
    await item0.getByRole("option").first().click();

    await page.getByRole("button", { name: "項目を追加" }).click();

    const item1 = page.getByTestId("expense-item-1");
    await item1.getByLabel("内容").fill("日用品");
    await item1.getByLabel("金額").fill("2000");
    const item1Options = item1.getByRole("option");
    if ((await item1Options.count()) >= 2) {
      await item1Options.nth(1).click();
    } else {
      await item1Options.first().click();
    }

    await page.getByRole("button", { name: "保存して次へ" }).click();

    // 保存完了（フォームリセット）を待機
    await expect(page.getByLabel("店舗名 / 支払先")).toHaveValue("", { timeout: 15_000 });

    // 週次サマリーへ移動
    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    // カテゴリ別集計セクションが表示される（expenseEntries ベースの集計確認）
    await expect(page.getByRole("heading", { name: "カテゴリ別" })).toBeVisible({
      timeout: 15_000,
    });

    // 支出一覧に複数項目が個別エントリとして反映される
    const receiptGroup = page.getByTestId("receipt-group").filter({ hasText: "テストスーパー" });
    await expect(receiptGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(receiptGroup.getByText("内訳: 食料品、日用品")).toBeVisible();
    const receiptRows = receiptGroup.getByTestId("receipt-row");
    await expect(receiptRows.filter({ hasText: "食料品" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(receiptRows.filter({ hasText: "日用品" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      receiptRows.filter({ hasText: "食料品" }).first().locator(".receipt-row-category"),
    ).toBeVisible();
    await expect(
      receiptRows.filter({ hasText: "日用品" }).first().locator(".receipt-row-category"),
    ).toBeVisible();
  });
});
