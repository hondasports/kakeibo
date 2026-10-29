import { type Page } from "@playwright/test";

/**
 * ユーザーメニューを開いて指定メニューアイテムをクリックするヘルパー。
 *
 * MUI の Menu コンポーネントは open/close 時に exit アニメーションがあり、
 * menuitem が DOM から detach されるタイミングで Playwright がクリックしようとすると
 * "element was detached from the DOM" エラーが発生する。
 *
 * このヘルパーは:
 *   1. user-menu-button をクリック
 *   2. [role="menu"] が visible になるまで待機
 *   3. 対象 menuitem が visible かつ enabled になるまで待機してからクリック
 *
 * @param page - Playwright の Page オブジェクト
 * @param itemName - クリックするメニューアイテムのテキスト
 */
export async function clickUserMenuItem(page: Page, itemName: string): Promise<void> {
  // ユーザーメニューボタンをクリック
  await page.locator('[class*="user-menu-button"]').click();

  // MUI Menu の [role="menu"] が visible になるまで待機
  const menu = page.getByRole("menu");
  await menu.waitFor({ state: "visible" });

  // 対象 menuitem が visible かつ enabled になるまで待機してクリック
  const menuItem = page.getByRole("menuitem", { name: itemName });
  await menuItem.waitFor({ state: "visible" });
  await menuItem.click();
}

/** 設定台帳の「危険な操作」セクションを開く（既に開いていれば何もしない） */
export async function expandDangerZone(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "危険な操作" });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
}
