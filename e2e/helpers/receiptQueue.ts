import { expect, type Locator, type Page } from "@playwright/test";

/**
 * 週次セッション読み込み後にレシート入力ワークベンチが表示されるまで待ち、
 * キュー本体の Locator を返す。
 */
export async function waitForReceiptInputQueue(page: Page) {
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

/** <details> が閉じていれば summary をクリックして開く（下書き確認ダイアログの商品行など） */
export async function expandDetailsIfClosed(details: Locator) {
  if ((await details.getAttribute("open")) === null) {
    await details.locator("summary").click();
  }
}
