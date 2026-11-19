import { expect, test } from "@playwright/test";
import { addMonths, formatMonthLabel } from "../lib/domain/common/month";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupE2eExpenseEntries, cleanupTestReceipts } from "./helpers/cleanup";
import { saveExpense } from "./helpers/expenseEntry";
import { expectNoContentOverflow } from "./helpers/viewport";

test.describe("月次サマリー（Issue #87）", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page);
    // 共有E2Eグループの既存データを消し、選択した過去月の空状態を決定的にする。
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestReceipts({ page });
  });

  test.afterEach(async ({ page }) => {
    await cleanupE2eExpenseEntries({ page });
    await cleanupTestReceipts({ page });
  });

  test("@smoke 年月ピッカーから月次URLへ遷移できる", async ({ page }) => {
    const fixedNow = new Date("2026-08-12T03:00:00.000Z");
    await page.clock.setFixedTime(fixedNow);
    const currentMonth = "2026-08";
    const targetMonth = addMonths(currentMonth, -12);
    const [targetYear, targetMonthNumber] = targetMonth.split("-");

    await page.goto(`/months/${currentMonth}`);
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(page.getByRole("heading", { name: "月次サマリー", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /表示する月を選ぶ/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "カレンダー表示から年選択表示に切り替える" }).click();
    await page.getByRole("radio", { name: targetYear, exact: true }).click();
    await page.getByRole("radio", { name: `${Number(targetMonthNumber)}月`, exact: true }).click();

    await expect(page).toHaveURL(`/months/${targetMonth}`);
    await expect(
      page.locator(`[aria-label="${formatMonthLabel(targetMonth)}を選択"]`),
    ).toBeVisible();
  });

  test("@smoke 日付heatmapからその日の明細へ遷移して月全体へ戻れる", async ({ page }) => {
    const fixedNow = new Date("2026-08-12T03:00:00.000Z");
    await page.clock.setFixedTime(fixedNow);
    const currentMonth = "2026-08";
    const expenseTitle = `E2Eヒートマップ支出_${Date.now()}`;
    const incomeTitle = `E2Eヒートマップ収入_${Date.now()}`;

    await page.goto("/weeks/current/input");
    await page
      .getByRole("listbox", { name: "週内の日付候補" })
      .getByRole("option", { name: /8\/12/ })
      .click();
    await saveExpense(page, expenseTitle, "1234");

    await page.getByRole("tab", { name: "収入" }).click();
    await page.getByLabel("金額").fill("77777");
    await page.getByLabel("収入の内容・メモ").fill(incomeTitle);
    await page.getByRole("button", { name: "保存して次へ" }).click();
    await expect(page.getByLabel("金額")).toHaveValue("", { timeout: 10_000 });

    await page.goto(`/months/${currentMonth}`);
    await expect(page.getByRole("heading", { name: "支出カレンダー", level: 2 })).toBeVisible();

    const dayButton = page.locator('[data-date="2026-08-12"]');
    await expect(dayButton).toHaveAttribute("data-expense-intensity", /[1-4]/);
    await expect(dayButton).toHaveAttribute("data-has-income", "true");

    await dayButton.click();
    await expect(page).toHaveURL(`/months/${currentMonth}?date=${currentMonth}-12`);
    await expect(page.getByRole("heading", { name: "2026年8月12日の明細" })).toBeVisible();
    await expect(page.getByLabel("2026年8月12日の支出一覧")).toContainText(expenseTitle);
    await expect(page.getByLabel("2026年8月12日の収入一覧")).toContainText(incomeTitle);

    // Issue #1295: 狭いPC幅（900〜1199px）で支出・収入の一覧が枠からはみ出さないこと
    for (const width of [900, 1199]) {
      await page.setViewportSize({ width, height: 900 });
      for (const listName of ["2026年8月12日の支出一覧", "2026年8月12日の収入一覧"]) {
        const list = page.getByLabel(listName);
        await expect(list).toBeVisible();
        await expectNoContentOverflow(list);
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByRole("button", { name: "月全体を見る" }).click();
    await expect(page).toHaveURL(`/months/${currentMonth}`);
  });
});
