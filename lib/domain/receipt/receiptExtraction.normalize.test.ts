import { describe, expect, it } from "vitest";
import { normalizeReceiptExtraction } from "./receiptExtraction";

describe("normalizeReceiptExtraction", () => {
  it.each([
    ["¥1,234", 1234],
    ["￥1,234", 1234],
    ["1,234円", 1234],
    ["1234", 1234],
    ["１，２３４円", 1234],
  ])("金額 %s を %d に正規化する", (amountYen, expected) => {
    const result = normalizeReceiptExtraction({
      shopName: "サンプルストア",
      date: "2026-05-23",
      amountYen,
      confidence: { shopName: 0.95, date: 0.95, amountYen: 0.95 },
      warnings: [],
    });

    expect(result.fields.amountYen).toBe(expected);
    expect(result.fieldStatuses.amountYen.status).toBe("applied");
  });

  it.each(["", "abc", "0", "-100", "1,234.56", "1,234円 2,345円", "10,000,000"])(
    "不正または曖昧な金額 %s は自動反映しない",
    (amountYen) => {
      const result = normalizeReceiptExtraction({
        shopName: "サンプルストア",
        date: "2026-05-23",
        amountYen,
        confidence: { shopName: 0.95, date: 0.95, amountYen: 0.95 },
        warnings: [],
      });

      expect(result.fields.amountYen).toBeUndefined();
      expect(result.fieldStatuses.amountYen.status).toBe("rejected");
    },
  );

  it.each([
    ["2026/05/23", "2026-05-23"],
    ["2026-05-23", "2026-05-23"],
    ["2026.05.23", "2026-05-23"],
    ["2026年5月23日", "2026-05-23"],
  ])("日付 %s を %s に正規化する", (date, expected) => {
    const result = normalizeReceiptExtraction({
      shopName: "サンプルストア",
      date,
      amountYen: "1,234円",
      confidence: { shopName: 0.95, date: 0.95, amountYen: 0.95 },
      warnings: [],
    });

    expect(result.fields.date).toBe(expected);
    expect(result.fieldStatuses.date.status).toBe("applied");
  });

  it.each([
    "",
    "2026/02/30",
    "2026/13/01",
    "5/23",
    "2026/05/230",
    "12026/05/23",
    "2026/05/23 2026/05/24",
    "2026/05/23〜2026/05/24",
  ])("不正または曖昧な日付 %s は自動反映しない", (date) => {
    const result = normalizeReceiptExtraction({
      shopName: "サンプルストア",
      date,
      amountYen: "1,234円",
      confidence: { shopName: 0.95, date: 0.95, amountYen: 0.95 },
      warnings: [],
    });

    expect(result.fields.date).toBeUndefined();
    expect(result.fieldStatuses.date.status).toBe("rejected");
  });

  it("confidence が低い項目は要確認として扱い、自動反映しない", () => {
    const result = normalizeReceiptExtraction({
      shopName: "サンプルストア",
      date: "2026/05/23",
      amountYen: "1,234円",
      confidence: { shopName: 0.95, date: 0.42, amountYen: 0.95 },
      warnings: [],
    });

    expect(result.fields.shopName).toBe("サンプルストア");
    expect(result.fields.amountYen).toBe(1234);
    expect(result.fields.date).toBeUndefined();
    expect(result.fieldStatuses.date.status).toBe("needs_confirmation");
    expect(result.issueMessages).toContain("日付は要確認です");
  });

  it.each([
    undefined,
    null,
    { shopName: 0.95, amountYen: 0.95 },
    { shopName: 0.95, date: Number.NaN, amountYen: 0.95 },
    { shopName: 0.95, date: 1.2, amountYen: 0.95 },
  ])("confidence が欠落または不正な場合は要確認として扱う: %s", (confidence) => {
    const result = normalizeReceiptExtraction({
      shopName: "サンプルストア",
      date: "2026/05/23",
      amountYen: "1,234円",
      confidence,
      warnings: [],
    });

    expect(result.fields.date).toBeUndefined();
    expect(result.fieldStatuses.date.status).toBe("needs_confirmation");
    expect(result.issueMessages).toContain("日付は要確認です");
  });

  it("warnings がある場合は正規化できる値でも要確認として扱い、自動反映しない", () => {
    const result = normalizeReceiptExtraction({
      shopName: "サンプルストア",
      date: "2026/05/23",
      amountYen: "1,234円",
      confidence: { shopName: 0.95, date: 0.95, amountYen: 0.95 },
      warnings: ["合計金額候補が複数あります"],
    });

    expect(result.fields).toEqual({});
    expect(result.fieldStatuses.shopName.status).toBe("needs_confirmation");
    expect(result.fieldStatuses.date.status).toBe("needs_confirmation");
    expect(result.fieldStatuses.amountYen.status).toBe("needs_confirmation");
    expect(result.warnings).toEqual(["合計金額候補が複数あります"]);
    expect(result.issueMessages).toContain("要確認の項目があります");
    expect(result.issueMessages).toContain("合計金額候補が複数あります");
  });

  it("rejected の項目別理由を issueMessages に含める", () => {
    const result = normalizeReceiptExtraction({
      shopName: "",
      date: "2026/02/30",
      amountYen: "abc",
      confidence: { shopName: 0.95, date: 0.95, amountYen: 0.95 },
      warnings: [],
    });

    expect(result.issueMessages).toContain(
      "店舗名は自動反映できません: 店舗名を読み取れませんでした",
    );
    expect(result.issueMessages).toContain("日付は自動反映できません: 存在しない日付です");
    expect(result.issueMessages).toContain("金額は自動反映できません: 金額候補が曖昧です");
  });
});
