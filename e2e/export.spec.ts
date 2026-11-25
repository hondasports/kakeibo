import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupE2eExpenseEntries } from "./helpers/cleanup";
import { saveExpense } from "./helpers/expenseEntry";

// Issue #1559: ブラウザのダウンロードに固有の動作なのでE2Eで確認する。
// 明細の登録と後始末は既存helper（auth・expenseEntry・cleanup）の経路だけを使う。
test("@smoke 登録した明細が /export からCSVとしてダウンロードされ、内容に含まれる", async ({
  page,
}) => {
  await gotoAuthenticated(page, "/weeks/current/input");
  await cleanupE2eExpenseEntries({ page });
  try {
    await saveExpense(page, "E2E書き出し確認店", "4321");

    await page.goto("/export");
    await expect(page.getByRole("heading", { name: "データの書き出し" })).toBeVisible();
    // デフォルトの期間は当月。当日登録した明細が必ず期間に含まれるため変更しない。
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSVをダウンロード" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^suzumemo-export-\d{8}-\d{8}\.csv$/);

    const path = await download.path();
    const content = await readFile(path, "utf-8");
    // BOM付きUTF-8（Excelでの文字化け防止）
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const body = content.slice(1);
    expect(body.split(/\r?\n/)[0]).toBe("日付,種別,タイトル,カテゴリ,金額,メモ");

    const row = body.split(/\r?\n/).find((line) => line.includes("E2E書き出し確認店"));
    expect(row).toBeDefined();
    expect(row).toContain("支出");
    expect(row).toContain(",4321,");
  } finally {
    await cleanupE2eExpenseEntries({ page });
  }
});
