import { test, expect } from "@playwright/test";
import { gotoAuthenticated, getCurrentClerkTokenIdentifier } from "./helpers/auth";
import { seedUnallocatedTaxDraftByUser } from "./helpers/seed";
import { cleanupAiExpenseQueueByUser } from "./helpers/cleanup";

test.use({ actionTimeout: 15000 });

test("#748 未配分の13明細を確認して税込合計・税額を保存後も維持する", async ({ page }) => {
  test.setTimeout(120000);
  await gotoAuthenticated(page, "/weeks/current/input");
  const userId = await getCurrentClerkTokenIdentifier(page);
  await cleanupAiExpenseQueueByUser(userId);
  try {
    await seedUnallocatedTaxDraftByUser(userId);
    await page.reload();
    const row = page.locator(".ai-expense-queue-item").filter({ hasText: "E2E税配分確認店" });
    await row.getByRole("button", { name: "確認する" }).click();
    const dialog = page.getByRole("dialog", { name: "下書き確認" });
    const checks = dialog.getByRole("region", { name: "確認結果", exact: true });
    // 金額は印字どおり一致している。割引対象は最寄りの商品へ自動推論される。
    await expect(
      checks.getByText(/明細合計 4,292円 ＋ 税額 370円 ＝ 支払額 4,662円/),
    ).toBeVisible();
    // Choose the actual discount targets without changing their tax rates.
    for (const [name, target] of [
      ["割引4", "商品3"],
      ["割引8", "商品7"],
      ["割引9", "商品7"],
    ]) {
      const item = dialog.locator("details").filter({
        has: page.getByRole("button", {
          name: name + "を削除",
          exact: true,
          includeHidden: true,
        }),
      });
      if (!(await item.getByRole("combobox", { name: "割引対象の商品", exact: true }).isVisible()))
        await item.locator("summary").click();
      await item.getByRole("combobox", { name: "割引対象の商品", exact: true }).click();
      await page.getByRole("option", { name: target, exact: true }).click();
    }
    await expect(dialog.getByRole("region", { name: "商品一覧" })).toContainText(
      "割引の対象税率が対象商品（8%）と異なります",
    );
    // Fix each summary using the existing editor; the first editor becomes read-only after save.
    await dialog.getByText("読み取り原文・詳しい税情報（参考）", { exact: true }).click();
    for (let i = 0; i < 2; i++) {
      const section = dialog.getByRole("region", { name: "税内訳を確認", exact: true });
      await section.getByRole("combobox", { name: "対象額種別", exact: true }).first().click();
      await page.getByRole("option", { name: "税抜印字", exact: true }).click();
      await section.getByRole("button", { name: "保存", exact: true }).first().click();
      await expect(section.getByRole("combobox", { name: "対象額種別", exact: true })).toHaveCount(
        1 - i,
      );
    }
    for (const name of ["割引8", "割引9"]) {
      const item = dialog.locator("details").filter({ hasText: name }).first();
      if ((await item.getAttribute("open")) === null) await item.locator("summary").click();
      await item.getByRole("combobox", { name: name + "の割引対象税率", exact: true }).click();
      await page.getByRole("option", { name: "8%対象の割引", exact: true }).click();
      await expect(
        dialog.getByRole("combobox", { name: name + "の割引対象税率", exact: true }),
      ).toHaveText("8%対象の割引");
    }
    await expect(
      checks.getByText(/明細合計 4,292円 ＋ 税額 370円 ＝ 支払額 4,662円/),
    ).toBeVisible();
    await expect(checks.getByText(/現在 2,912円 ／ 印字 2,912円/)).toBeVisible();
    await expect(checks.getByText(/現在 1,380円 ／ 印字 1,380円/)).toBeVisible();
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await row.getByRole("button", { name: "修正する" }).click();
    await expect(
      checks.getByText(/明細合計 4,292円 ＋ 税額 370円 ＝ 支払額 4,662円/),
    ).toBeVisible();
    await expect(checks.getByText(/現在 2,912円 ／ 印字 2,912円/)).toBeVisible();
    await expect(checks.getByText(/現在 1,380円 ／ 印字 1,380円/)).toBeVisible();
  } finally {
    await cleanupAiExpenseQueueByUser(userId);
  }
});
