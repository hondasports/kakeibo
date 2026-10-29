import { expect, type Page } from "@playwright/test";

type SaveExpenseOptions = {
  /** メモ欄に入力する値。指定した場合は金額入力後・カテゴリ選択前に入力する */
  memo?: string;
  /** 店舗名クリア（=保存完了）の待機タイムアウト。デフォルト 10,000ms */
  clearTimeout?: number;
};

/**
 * 手入力フォームで支出を1件保存する。
 * 店舗名・合計金額（・任意でメモ）を入力し、先頭のカテゴリ候補を選んで
 * 「保存して次へ」を押し、店舗名がクリアされる（=保存完了）まで待つ。
 */
export async function saveExpense(
  page: Page,
  shopName: string,
  amount: string,
  options: SaveExpenseOptions = {},
) {
  await page.getByLabel("店舗名 / 支払先").fill(shopName);
  await page.getByLabel("合計金額").fill(amount);
  if (options.memo !== undefined) {
    await page.getByLabel("メモ").fill(options.memo);
  }
  await page.locator('[role="listbox"][aria-label="カテゴリ候補"] [role="option"]').first().click();
  await page.getByRole("button", { name: "保存して次へ" }).click();
  await expect(page.getByLabel("店舗名 / 支払先")).toHaveValue("", {
    timeout: options.clearTimeout ?? 10_000,
  });
}
