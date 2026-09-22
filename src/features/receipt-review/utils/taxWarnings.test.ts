import { describe, expect, it } from "vitest";
import { formatTaxWarnings } from "./taxWarnings";

describe("formatTaxWarnings", () => {
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
});
