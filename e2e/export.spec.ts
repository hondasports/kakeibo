import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addDays, getTodayDateStringInJapan } from "../lib/domain/common/date";
import { gotoAuthenticated } from "./helpers/auth";
import { cleanupE2eExpenseEntries } from "./helpers/cleanup";
import { getCurrentWeekStartDate } from "./helpers/currentPeriod";
import { saveExpense } from "./helpers/expenseEntry";

// Issue #1559: ブラウザのダウンロードに固有の動作なのでE2Eで確認する。
// 明細の登録と後始末は既存helper（auth・expenseEntry・cleanup）の経路だけを使う。
test("@smoke 登録した明細が /export からCSVとしてダウンロードされ、内容に含まれる", async ({
  page,
}) => {
  await gotoAuthenticated(page, "/weeks/current/input");
  await cleanupE2eExpenseEntries({ page });
  try {
    // 入力画面はJST基準の今日を既定日付で保存する
    // （resolveEntryDefaultDate: 現在週のページでは週内に今日が必ず含まれる）。
    // ブラウザのローカル日付に依存する画面既定の期間に任せると、
    // UTCのCIで月末のJST 0〜9時に登録した明細が範囲外になりうるため、
    // 登録日を必ず含む今週の開始日〜終了日（ともにJST基準）を明示的に入れる。
    const entryDate = getTodayDateStringInJapan();
    const weekStartDate = getCurrentWeekStartDate();
    const weekEndDate = addDays(weekStartDate, 6);

    await saveExpense(page, "E2E書き出し確認店", "4321");

    await page.goto("/export");
    await expect(page.getByRole("heading", { name: "データの書き出し" })).toBeVisible();
    await page.getByLabel("開始日").fill(weekStartDate);
    await page.getByLabel("終了日").fill(weekEndDate);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSVをダウンロード" }).click();
    const download = await downloadPromise;

    // ファイル名は入れた期間と一致する
    const expectedFileName = `suzumemo-export-${weekStartDate.replaceAll("-", "")}-${weekEndDate.replaceAll("-", "")}.csv`;
    expect(download.suggestedFilename()).toBe(expectedFileName);

    const path = await download.path();
    const content = await readFile(path, "utf-8");
    // BOM付きUTF-8（Excelでの文字化け防止）
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const body = content.slice(1);
    expect(body.split(/\r?\n/)[0]).toBe("日付,種別,タイトル,カテゴリ,金額,メモ");

    const row = body.split(/\r?\n/).find((line) => line.includes("E2E書き出し確認店"));
    expect(row).toBeDefined();
    // 日付列は登録日（JSTの今日）で出力される
    expect(row?.split(",")[0]).toBe(entryDate);
    expect(row).toContain("支出");
    expect(row).toContain(",4321,");
  } finally {
    await cleanupE2eExpenseEntries({ page });
  }
});
