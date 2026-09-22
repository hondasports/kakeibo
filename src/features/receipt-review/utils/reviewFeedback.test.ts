import { describe, expect, it } from "vitest";
import { deriveVisibleReviewReasons } from "./reviewFeedback";

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
