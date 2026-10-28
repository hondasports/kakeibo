import { expect, test } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupE2eExpenseEntries, cleanupTestReceipts } from "./helpers/cleanup";
import { saveExpense } from "./helpers/expenseEntry";

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

test.describe("週次サマリーの一括操作（Issue #550）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page, "/weeks/current/input");
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestReceipts({ page });
  });

  test.afterEach(async ({ page }) => {
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestReceipts({ page });
  });

  test("@smoke 明細を選んでカテゴリ変更をプレビューし、削除は確認してから実行する", async ({
    page,
  }) => {
    const firstShop = uniqueName("QA一括A");
    const secondShop = uniqueName("QA一括B");

    await saveExpense(page, firstShop, "1100");
    await saveExpense(page, secondShop, "2200");

    await page.getByRole("link", { name: "履歴" }).click();
    await expect(page).toHaveURL(/\/weeks\/\d{4}-\d{2}-\d{2}$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "週次サマリー", level: 1 })).toBeVisible();

    const firstRow = page.getByTestId("receipt-row").filter({ hasText: firstShop }).first();
    const secondRow = page.getByTestId("receipt-row").filter({ hasText: secondShop }).first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await expect(secondRow).toBeVisible();

    await firstRow.getByRole("checkbox", { name: /を選択/ }).check();
    await secondRow.getByRole("checkbox", { name: /を選択/ }).check();
    await expect(page.getByText("明細2件を選択中")).toBeVisible();

    await page.getByRole("button", { name: "カテゴリを変更" }).click();
    const categoryDialog = page.getByRole("dialog");
    await expect(categoryDialog.getByText(/明細2件を/)).toBeVisible();
    await categoryDialog.getByLabel("変更後のカテゴリ").click();
    const categoryOption = page.getByRole("option").nth(1);
    const categoryName = (await categoryOption.innerText()).trim();
    await categoryOption.click();
    await expect(
      categoryDialog.getByText(`明細2件を「${categoryName}」へ変更します。`),
    ).toBeVisible();
    await categoryDialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("明細2件を選択中")).toBeVisible();

    await page.getByRole("button", { name: "カテゴリを変更" }).click();
    await page.getByLabel("変更後のカテゴリ").click();
    await page.getByRole("option", { name: categoryName, exact: true }).click();
    await page.getByRole("button", { name: "変更する" }).click();
    await expect(page.getByText("明細2件のカテゴリを変更しました。")).toBeVisible();
    await expect(firstRow.getByText(categoryName)).toBeVisible();
    await expect(secondRow.getByText(categoryName)).toBeVisible();

    await firstRow.getByRole("checkbox", { name: /を選択/ }).check();
    await secondRow.getByRole("checkbox", { name: /を選択/ }).check();
    await page
      .locator(".receipt-bulk-actions")
      .getByRole("button", { name: "削除", exact: true })
      .click();
    const deleteDialog = page.getByRole("dialog");
    await expect(
      deleteDialog.getByRole("heading", { name: "明細2件を削除しますか？" }),
    ).toBeVisible();
    await expect(
      deleteDialog.getByText("削除すると元に戻せません。今週の集計からも外れます。"),
    ).toBeVisible();
    await deleteDialog.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByText("明細2件を削除しました。")).toBeVisible();
    await expect(page.getByTestId("receipt-row").filter({ hasText: firstShop })).toHaveCount(0);
    await expect(page.getByTestId("receipt-row").filter({ hasText: secondShop })).toHaveCount(0);
  });
});
