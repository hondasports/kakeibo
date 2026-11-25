import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getTodayDateStringInJapan } from "../lib/domain/common/date";
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
    // 入力フォームの既定日付はJST基準の今日だが、JSTの0時をまたぐと
    // テスト側であらかじめ計算した期待値とずれうるため、
    // 既存specと同じ週日選択UIの操作で日付を明示してから保存する。
    // 選択した日付を書き出し期間（開始日・終了日ともにその日付）と
    // 日付列の期待に共通で使う。
    const entryDate = getTodayDateStringInJapan();
    const entryMonth = Number(entryDate.slice(5, 7));
    const entryDay = Number(entryDate.slice(8, 10));
    await page
      .getByRole("listbox", { name: "週内の日付候補" })
      .getByRole("option", { name: new RegExp(` ${entryMonth}/${entryDay}( 選択中)?$`) })
      .click();
    await saveExpense(page, "E2E書き出し確認店", "4321");

    await page.goto("/export");
    await expect(page.getByRole("heading", { name: "データの書き出し" })).toBeVisible();
    await page.getByLabel("開始日").fill(entryDate);
    await page.getByLabel("終了日").fill(entryDate);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSVをダウンロード" }).click();
    const download = await downloadPromise;

    // ファイル名は入れた期間と一致する
    const expectedFileName = `suzumemo-export-${entryDate.replaceAll("-", "")}-${entryDate.replaceAll("-", "")}.csv`;
    expect(download.suggestedFilename()).toBe(expectedFileName);

    const path = await download.path();
    const content = await readFile(path, "utf-8");
    // BOM付きUTF-8（Excelでの文字化け防止）
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const body = content.slice(1);
    const lines = body.split(/\r?\n/).filter((line) => line !== "");
    expect(lines[0]).toBe("日付,種別,タイトル,カテゴリ,金額,メモ");

    // 店名にカンマ・引用符は含まれないので列の分割は単純でよい。
    // 店名の行は1件だけのはず。
    const rows = lines.slice(1).filter((line) => line.includes("E2E書き出し確認店"));
    expect(rows).toHaveLength(1);
    const columns = rows[0].split(",");
    expect(columns).toHaveLength(6);
    expect(columns[0]).toBe(entryDate);
    expect(columns[1]).toBe("支出");
    expect(columns[2]).toBe("E2E書き出し確認店");
    expect(columns[3]).not.toBe("");
    expect(columns[4]).toBe("4321");
    expect(columns[5]).toBe("");
  } finally {
    await cleanupE2eExpenseEntries({ page });
  }
});
