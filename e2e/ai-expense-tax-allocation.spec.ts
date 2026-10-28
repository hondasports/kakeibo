import { test, expect } from "@playwright/test";
import { gotoAuthenticated, getCurrentClerkTokenIdentifier } from "./helpers/auth";
import { seedUnallocatedTaxDraftByUser } from "./helpers/seed";
import { cleanupAiExpenseQueueByUser } from "./helpers/cleanup";
import { expandDetailsIfClosed } from "./helpers/receiptQueue";

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
    // 配分できない状態を内部用語で見せず、商品を照合する案内を出す（Issue #1018）。
    const overall = dialog.getByRole("region", { name: "全体の確認状態" });
    await expect(
      overall.getByText(/8%の商品とレシートの照合：.*読み取り原文と照合してください/),
    ).toBeVisible();
    await expect(dialog.getByText("税額を商品に配分できていません")).toHaveCount(0);
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
    await expect(dialog.getByRole("combobox", { name: "対象額種別", exact: true })).toHaveCount(0);
    for (const name of ["割引8", "割引9"]) {
      const item = dialog.locator("details").filter({ hasText: name }).first();
      await expandDetailsIfClosed(item);
      await item.getByRole("combobox", { name: name + "の割引対象税率", exact: true }).click();
      await page.getByRole("option", { name: "8%対象の割引", exact: true }).click();
      await expect(
        dialog.getByRole("combobox", { name: name + "の割引対象税率", exact: true }),
      ).toHaveText("8%対象の割引");
    }
    // 金額・税率別ともに一致したため検算カードは出さず、成功メッセージだけが残る
    await expect(checks).toHaveCount(0);
    await expect(
      dialog
        .getByRole("region", { name: "全体の確認状態" })
        .getByText("印字額と明細の金額が一致しています"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "この内容で保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await row.getByRole("button", { name: "修正する" }).click();
    // 再オープン後も一致が維持され、検算カードは出ず成功メッセージだけが残る
    await expect(
      dialog
        .getByRole("region", { name: "全体の確認状態" })
        .getByText("印字額と明細の金額が一致しています"),
    ).toBeVisible();
    await expect(dialog.getByRole("region", { name: "確認結果" })).toHaveCount(0);
  } finally {
    await cleanupAiExpenseQueueByUser(userId);
  }
});
