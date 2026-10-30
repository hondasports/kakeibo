import { describe, expect, it } from "vitest";
import { dropResolvedAmountTaxReasons } from "./reviewFeedback";

describe("dropResolvedAmountTaxReasons", () => {
  const reasons = [
    "amount_mismatch",
    "normalized_amount_mismatch",
    "unresolved_tax_rate",
    "user_confirmation_required",
    "ambiguous_category",
  ];

  it("解決済みなら金額・税内訳の理由だけ外し、確認待ちと税以外の理由は残す", () => {
    expect(dropResolvedAmountTaxReasons(reasons, true)).toEqual([
      "user_confirmation_required",
      "ambiguous_category",
    ]);
  });

  it("未解決なら理由をそのまま返す", () => {
    expect(dropResolvedAmountTaxReasons(reasons, false)).toEqual(reasons);
  });
});
