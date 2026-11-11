import { describe, expect, it } from "vitest";
import { judgeReviewFormAmountAndTax } from "./reviewFormJudgment";
import type { ReviewFormValues, ReviewItemValues } from "./reviewTypes";

const form: ReviewFormValues = {
  documentType: "receipt",
  shopName: "店",
  date: "2026-11-01",
  amountYen: "90",
  categoryId: "food",
  registrationMode: "detailed",
};
const items: ReviewItemValues[] = [
  { id: "a", itemName: "商品", lineType: "item", amountYen: "100", categoryId: "food" },
  {
    id: "b",
    itemName: "特売",
    lineType: "discount",
    amountYen: "-10",
    categoryId: "food",
    discountTargetItemId: "a",
  },
];
describe("確認画面のフォームから正本への変換", () => {
  it("送信するカテゴリ・対象で一致を判定する", () => {
    const result = judgeReviewFormAmountAndTax(
      { documentType: "receipt", reviewReasons: [] },
      form,
      items,
    );
    expect(result.status).toBe("resolved");
    expect(result.checks.amount.status).toBe("matched");
  });
  it("金額を編集中に空にすると古い値で一致させない", () => {
    const edited = items.map((item, index) =>
      index === 0
        ? { ...item, amountYen: "", printedAmountYen: 100, normalizedAmountYen: 100 }
        : item,
    );
    expect(
      judgeReviewFormAmountAndTax({ documentType: "receipt", reviewReasons: [] }, form, edited)
        .status,
    ).toBe("unresolved");
  });
});
