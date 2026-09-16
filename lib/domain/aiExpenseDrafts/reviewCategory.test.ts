import { describe, expect, it } from "vitest";
import { getReviewCategoryErrorMessage, validateReviewCategory } from "./reviewCategory";

describe("validateReviewCategory", () => {
  it("null と他グループは同一エラー", () => {
    expect(validateReviewCategory(null, "g1")).toEqual({ success: false, error: "not_in_group" });
    expect(validateReviewCategory({ groupId: "g2", isActive: true }, "g1")).toEqual({
      success: false,
      error: "not_in_group",
    });
  });
  it("非アクティブは inactive", () => {
    expect(validateReviewCategory({ groupId: "g1", isActive: false }, "g1")).toEqual({
      success: false,
      error: "inactive",
    });
  });
  it("同グループ・アクティブは成功", () => {
    expect(validateReviewCategory({ groupId: "g1", isActive: true }, "g1")).toEqual({
      success: true,
    });
  });
  it("文言が既存と一致する", () => {
    expect(getReviewCategoryErrorMessage("not_in_group")).toBe(
      "Category does not belong to the current group",
    );
    expect(getReviewCategoryErrorMessage("inactive")).toBe(
      "Inactive category cannot be used for reviewed drafts",
    );
  });
});
