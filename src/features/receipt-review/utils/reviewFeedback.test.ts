import { describe, expect, it } from "vitest";
import { deriveVisibleReviewReasons, dropResolvedAmountTaxReasons } from "./reviewFeedback";

describe("deriveVisibleReviewReasons", () => {
  it("全明細のカテゴリ補完後は未分類警告を表示しない", () => {
    expect(
      deriveVisibleReviewReasons(
        ["ambiguous_category", "user_confirmation_required"],
        [{ categoryId: "food" }, { categoryId: "daily" }],
        "food",
      ),
    ).toEqual(["user_confirmation_required"]);
  });

  it("未分類明細が残る間は警告を維持する", () => {
    expect(
      deriveVisibleReviewReasons(["ambiguous_category"], [{ categoryId: "" }], "food"),
    ).toEqual(["ambiguous_category"]);
  });

  it("レシート全体カテゴリが空なら警告を維持する", () => {
    expect(
      deriveVisibleReviewReasons(["ambiguous_category"], [{ categoryId: "food" }], ""),
    ).toEqual(["ambiguous_category"]);
  });

  it("明細なしでもレシート全体カテゴリがあれば未分類警告を表示しない", () => {
    expect(deriveVisibleReviewReasons(["ambiguous_category"], [], "food")).toEqual([]);
  });
});

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
