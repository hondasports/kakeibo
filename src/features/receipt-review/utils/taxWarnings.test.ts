import { describe, expect, it } from "vitest";
import { formatTaxWarning, formatTaxWarnings, isDialogHiddenTaxWarning } from "./taxWarnings";

describe("formatTaxWarning", () => {
  it("税正規化の機械コードを日本語へ変換する", () => {
    expect(formatTaxWarning("normalized_amount_mismatch")).toBe(
      "お支払いと読み取った商品の合計が一致しません。",
    );
    expect(formatTaxWarning("unknown_tax_rate:items[0]")).toBe("税率が未確定の明細があります。");
    expect(formatTaxWarning("unknown_amount_basis:items[0]")).toBe(
      "税込・税抜が未確定の明細があります。",
    );
    expect(formatTaxWarning("taxable_amount_mismatch:8")).toBe(
      "読み取った商品の合計とレシート小計が一致しません。",
    );
    expect(formatTaxWarning("missing_tax_items:10")).toBe("税率別集計に対応する明細がありません。");
    expect(formatTaxWarning("future_tax_warning")).toBe("金額を確認してください。");
  });

  it("既存の日本語warningはそのまま返す", () => {
    expect(formatTaxWarning("品名が不鮮明です")).toBe("品名が不鮮明です");
  });

  it("同じ警告を件数付きでまとめて読みやすくする", () => {
    expect(
      formatTaxWarnings([
        "unknown_amount_basis:items[0]",
        "unknown_amount_basis:items[1]",
        "missing_tax_items:8",
        "normalized_amount_mismatch",
      ]),
    ).toBe(
      "税込・税抜が未確定の明細があります。（2件） / 税率別集計に対応する明細がありません。 / お支払いと読み取った商品の合計が一致しません。",
    );
  });

  it("dialog非表示warningを判定する", () => {
    expect(isDialogHiddenTaxWarning("normalized_amount_mismatch")).toBe(true);
    expect(isDialogHiddenTaxWarning("unknown_tax_rate:items[0]")).toBe(true);
    expect(isDialogHiddenTaxWarning("missing_tax_items:8")).toBe(false);
  });
});
