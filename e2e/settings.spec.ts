import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupTestCategories } from "./helpers/cleanup";

test.describe("設定台帳（Issue #375）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/settings");
    await expect(page.getByRole("heading", { name: "設定", level: 1 })).toBeVisible();
  });

  test("@smoke 4領域の現在値と危険な操作を順序どおり表示する", async ({ page }) => {
    const ledger = page.getByTestId("settings-ledger");
    await expect(ledger).toBeVisible();
    await expect(ledger.getByText(/.+曜日 から .+曜日 まで/)).toBeVisible();

    const dangerTrigger = ledger.getByRole("button", { name: "危険な操作" });
    await expect(dangerTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(ledger.getByRole("button", { name: "管理する" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(ledger.getByTestId("group-info-section")).toHaveCount(0);
  });

  test("@smoke @staging 週設定を保存して成功通知を表示する", async ({ page }) => {
    const ledger = page.getByTestId("settings-ledger");
    const weekSection = ledger.locator(".settings-ledger-section", {
      has: page.getByRole("heading", { name: "週の設定", level: 2 }),
    });
    const saveButton = weekSection.getByRole("button", { name: "変更を保存" });
    const savedToast = page.getByText("週の設定を保存しました");
    const saveAndWait = async () => {
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      await expect(savedToast).toBeVisible({ timeout: 15_000 });
    };

    // 値が未変更だと保存ボタンは無効なので、現在値と違う曜日を選ぶ
    const startDaySelect = weekSection.getByRole("combobox", { name: "週の始まり" });
    const originalLabel = (await startDaySelect.innerText()).trim();
    let changed = false;
    try {
      await startDaySelect.click();
      const options = page.getByRole("listbox").getByRole("option");
      const optionCount = await options.count();
      for (let i = 0; i < optionCount; i += 1) {
        const option = options.nth(i);
        if ((await option.innerText()).trim() !== originalLabel) {
          await option.click();
          changed = true;
          break;
        }
      }
      await saveAndWait();
    } finally {
      // 週開始曜日はE2Eユーザー全体の共有設定なので、変更した値は元に戻す。
      // 復元時は1回目の保存トーストと見分けるため、消えるのを待ってから保存する。
      if (changed) {
        await expect(savedToast).toBeHidden({ timeout: 10_000 });
        await startDaySelect.click();
        await page
          .getByRole("listbox")
          .getByRole("option", { name: originalLabel, exact: true })
          .click();
        await saveAndWait();
      }
    }
  });

  test("@smoke /categories 互換ルートでも同じ設定台帳を表示する", async ({ page }) => {
    await page.goto("/categories");
    await expect(page).toHaveURL("/categories");
    await expect(page.getByTestId("settings-ledger")).toBeVisible();
    await expect(page.getByRole("heading", { name: "カテゴリ", level: 2 })).toBeVisible();
  });
});

test.describe("設定台帳（Issue #510 カテゴリ分類ヒント）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/settings");
    await expect(page.getByRole("heading", { name: "設定", level: 1 })).toBeVisible();
  });

  test.afterEach(async () => {
    await cleanupTestCategories();
  });

  test("@smoke P1 分類ヒントを保存して再読み込み後も保持する", async ({ page }) => {
    const categoryName = `E2Eカテゴリ-分類ヒント-${Date.now()}`;
    const description = "食品以外のペット用品\n衛生用品や消耗品を分類する";

    await page.getByRole("button", { name: "カテゴリを追加" }).click();
    await page.getByRole("textbox", { name: "新しいカテゴリ名" }).fill(categoryName);
    await page.getByRole("textbox", { name: "新しいカテゴリのAI分類ヒント" }).fill(description);
    await page.getByRole("button", { name: "追加する" }).click();
    await expect(page.getByText("カテゴリを追加しました")).toBeVisible();

    await page.reload();
    const categoryRow = page.getByRole("listitem", { name: `カテゴリ ${categoryName}` });
    await expect(categoryRow).toBeVisible();
    await categoryRow.getByRole("button", { name: `${categoryName}を編集` }).click();
    await expect(categoryRow.getByRole("textbox", { name: "カテゴリのAI分類ヒント" })).toHaveValue(
      description,
    );
  });
});
