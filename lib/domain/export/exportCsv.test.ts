import { describe, expect, it } from "vitest";
import { buildExportCsv, splitDateRangeIntoMonths } from "./exportCsv";

describe("buildExportCsv", () => {
  it("ヘッダーと行をCRLF区切りで出力する", () => {
    const csv = buildExportCsv([
      {
        date: "2026-06-01",
        kind: "income",
        title: "給与",
        categoryName: "",
        amountYen: 180000,
        memo: "",
      },
      {
        date: "2026-06-15",
        kind: "expense",
        title: "スーパー北浜",
        categoryName: "食費",
        amountYen: 1200,
        memo: "週末まとめ買い",
      },
    ]);
    expect(csv).toBe(
      "日付,種別,タイトル,カテゴリ,金額,メモ\r\n" +
        "2026-06-01,収入,給与,,180000,\r\n" +
        "2026-06-15,支出,スーパー北浜,食費,1200,週末まとめ買い",
    );
  });

  it("カンマ・引用符・改行を含む値をエスケープする", () => {
    const csv = buildExportCsv([
      {
        date: "2026-06-01",
        kind: "expense",
        title: '店"A",B',
        categoryName: "食費",
        amountYen: 100,
        memo: "一行目\n二行目",
      },
    ]);
    expect(csv.split("\r\n")[1]).toBe('2026-06-01,支出,"店""A"",B",食費,100,"一行目\n二行目"');
  });

  it("数式になりうる先頭文字のセルを ' でエスケープする", () => {
    const csv = buildExportCsv([
      {
        date: "2026-06-01",
        kind: "expense",
        title: '=HYPERLINK("https://evil.example")',
        categoryName: "+1+2",
        amountYen: 100,
        memo: "@sum(1)",
      },
    ]);
    const row = csv.split("\r\n")[1].split(",");
    expect(row[2]).toBe(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(row[3]).toBe("'+1+2");
    expect(row[5]).toBe("'@sum(1)");
  });

  it("0件でもヘッダーだけ返す", () => {
    expect(buildExportCsv([])).toBe("日付,種別,タイトル,カテゴリ,金額,メモ");
  });
});

describe("splitDateRangeIntoMonths", () => {
  it("単月はそのまま1区間", () => {
    expect(splitDateRangeIntoMonths("2026-06-01", "2026-06-30")).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-30" },
    ]);
  });

  it("月またぎは月単位に分割する", () => {
    expect(splitDateRangeIntoMonths("2026-01-15", "2026-03-10")).toEqual([
      { startDate: "2026-01-15", endDate: "2026-01-31" },
      { startDate: "2026-02-01", endDate: "2026-02-28" },
      { startDate: "2026-03-01", endDate: "2026-03-10" },
    ]);
  });

  it("年またぎとうるう年の月末を正しく切る", () => {
    const ranges = splitDateRangeIntoMonths("2024-12-20", "2025-01-05");
    expect(ranges).toEqual([
      { startDate: "2024-12-20", endDate: "2024-12-31" },
      { startDate: "2025-01-01", endDate: "2025-01-05" },
    ]);
    expect(splitDateRangeIntoMonths("2024-02-01", "2024-02-29")).toEqual([
      { startDate: "2024-02-01", endDate: "2024-02-29" },
    ]);
  });
});
