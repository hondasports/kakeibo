import { test, expect, type Locator } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import {
  expectLocatorInsideViewport,
  expectLocatorLeftInsideViewport,
  expectNoHorizontalOverflow,
} from "./helpers/viewport";

/** Issue #354 スクショ相当の SP 幅 */
const MOBILE_VIEWPORT = { width: 406, height: 687 };

/** 遷移アニメーション中は位置が動き続けるため、連続2回の測定値が一致するまで待つ */
async function waitForStableBounds(...locators: Locator[]) {
  let previous = "";
  await expect
    .poll(
      async () => {
        const rects = await Promise.all(locators.map((locator) => locator.boundingBox()));
        const current = JSON.stringify(rects);
        const stable = previous === current;
        previous = current;
        return stable;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * レスポンシブ表示 E2E テスト
 *
 * Issue #20「MVPレスポンシブ確認」の受け入れ確認。
 *
 * カバーするシナリオ:
 *   - ~~シナリオ R-1: 390px viewport でメイン画面の主要要素が表示される (P1 / smoke)~~
 *     **削除** (Issue #49 でダッシュボードが変更されたため)
 *   - ~~シナリオ R-2: 320px viewport でメイン画面の主要要素が表示される (P1 / smoke)~~
 *     **削除** (Issue #49 でダッシュボードが変更されたため)
 *   - シナリオ R-3: 390px viewport で設定画面の主要要素が表示される (P1 / smoke)
 *     **更新** (BottomNavigation 経由の遷移に変更)
 *   - シナリオ R-4: 406px viewport で入力画面が横スクロールせず主要要素が viewport 内に収まる (P1 / smoke)
 *     Issue #354 対応
 *
 * テストデータ・cleanup:
 *   - レシート・カテゴリを作成しないため cleanup 不要。
 */

test.describe("レスポンシブ表示（Issue #20）", () => {
  test("@smoke シナリオR-3: 320px・390px・900pxで設定台帳が横にはみ出さない", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await gotoAuthenticated(page, "/settings");

    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 900, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/settings");

      await expect(page.getByRole("heading", { name: "設定", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "グループ", level: 2 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "カテゴリ", level: 2 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "週の設定", level: 2 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectLocatorInsideViewport(page.getByTestId("settings-ledger"));
    }
  });

  test("@smoke シナリオR-4: 406px viewport で入力画面が横スクロールせず主要要素が表示される", async ({
    page,
  }) => {
    await gotoAuthenticated(page);
    await page.setViewportSize(MOBILE_VIEWPORT);

    await page
      .getByRole("navigation", { name: "ボトムナビゲーション" })
      .getByRole("link", { name: "入力" })
      .click();
    await expect(page).toHaveURL("/weeks/current/input");

    await expect(page.getByRole("heading", { name: "入力", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "支出" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "収入" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "レシート入力" })).toBeVisible();
    const queueSection = page.locator("section.ai-expense-queue");
    const addReceiptButton = queueSection.getByRole("button", { name: "画像を読み取る" }).first();
    const cameraButton = queueSection.getByRole("button", { name: "カメラで撮影" });
    await expect(addReceiptButton).toBeVisible();
    await expect(cameraButton).toBeVisible();

    const shopNameInput = page.getByLabel("店舗名 / 支払先");
    const amountInput = page.getByLabel("合計金額");
    const categoryList = page.getByRole("listbox", { name: "カテゴリ候補" });
    const saveButton = page.getByRole("button", { name: "保存して次へ" });
    await expect(shopNameInput).toBeVisible();
    await expect(amountInput).toBeVisible();
    await expect(categoryList).toBeVisible();
    await expect(saveButton).toBeVisible();

    await waitForStableBounds(queueSection, shopNameInput, saveButton);

    await expectNoHorizontalOverflow(page);
    await expectLocatorInsideViewport(queueSection);
    await expectLocatorInsideViewport(addReceiptButton);
    await expectLocatorInsideViewport(cameraButton);
    await expectLocatorInsideViewport(shopNameInput);
    await expectLocatorInsideViewport(amountInput);
    await expectLocatorInsideViewport(categoryList);
    await expectLocatorInsideViewport(saveButton);
    await expectLocatorLeftInsideViewport(saveButton);

    await page.getByRole("tab", { name: "収入" }).click();
    await expect(page.getByLabel("金額")).toBeVisible();
    await expect(page.getByLabel("収入の内容・メモ")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("@smoke シナリオR-4b: 406px viewport でキュー有データ時も主要要素が viewport 内に収まる（/__e2e__/ fixture・サーバー保存なし）", async ({
    page,
  }) => {
    await gotoAuthenticated(page);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/__e2e__/ai-expense-queue");

    const queueSection = page.locator("section.ai-expense-queue");
    const statusSummary = page.locator(".ai-expense-queue-status-summary");
    const addReceiptButton = queueSection.getByRole("button", { name: "画像を読み取る" }).first();
    const cameraButton = queueSection.getByRole("button", { name: "カメラで撮影" });
    const failedChip = queueSection.getByText("読み取り失敗 1件");

    await expect(queueSection).toBeVisible();
    await expect(statusSummary).toBeVisible();
    await expect(addReceiptButton).toBeVisible();
    await expect(cameraButton).toBeVisible();
    await expect(failedChip).toBeVisible();
    await expect(queueSection.getByText("登録できます 1件")).toBeVisible();
    await expect(queueSection.getByText("確認待ち 1件")).toBeVisible();

    await waitForStableBounds(queueSection, statusSummary);

    await expectNoHorizontalOverflow(page);
    await expectLocatorInsideViewport(queueSection);
    await expectLocatorInsideViewport(statusSummary);
    await expectLocatorInsideViewport(addReceiptButton);
    await expectLocatorInsideViewport(cameraButton);
    await expectLocatorInsideViewport(failedChip);
    await expect(queueSection.getByRole("region", { name: "登録済み" })).toBeVisible();
    await expectLocatorInsideViewport(queueSection.getByRole("region", { name: "登録済み" }));
  });

  test("@smoke シナリオR-4c: 406px viewport で入力ワークベンチが横スクロールせず登録済みがフォームの後", async ({
    page,
  }) => {
    await gotoAuthenticated(page);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/__e2e__/input-workbench");

    const queueSection = page.locator("section.ai-expense-queue");
    const addReceiptButton = queueSection.getByRole("button", { name: "画像を読み取る" }).first();
    const cameraButton = queueSection.getByRole("button", { name: "カメラで撮影" });
    const shopNameInput = page.getByLabel("店舗名 / 支払先");
    const registeredRegion = page.getByRole("region", { name: "登録済み" });

    await expect(addReceiptButton).toBeVisible();
    await expect(cameraButton).toBeVisible();
    await expect(shopNameInput).toBeVisible();
    await expect(registeredRegion).toBeVisible();
    await expect(registeredRegion.getByText("ジャパン 明石稲美店")).toBeVisible();

    await waitForStableBounds(addReceiptButton, shopNameInput, registeredRegion);

    await expectNoHorizontalOverflow(page);
    await expectLocatorInsideViewport(addReceiptButton);
    await expectLocatorInsideViewport(cameraButton);
    await expectLocatorInsideViewport(shopNameInput);
    await expectLocatorInsideViewport(registeredRegion);
    await expectLocatorInsideViewport(registeredRegion.getByText("ジャパン 明石稲美店"));

    const addReceiptY = await addReceiptButton.evaluate(
      (element) => element.getBoundingClientRect().y,
    );
    const shopNameY = await shopNameInput.evaluate((element) => element.getBoundingClientRect().y);
    const registeredY = await registeredRegion.evaluate(
      (element) => element.getBoundingClientRect().y,
    );
    expect(addReceiptY).toBeLessThan(shopNameY);
    expect(shopNameY).toBeLessThan(registeredY);
  });
});
