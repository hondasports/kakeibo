import { describe, expect, it } from "vitest";
import { isDiscountItemName, sanitizeSignedYenInput } from "./discountItems";

describe("discountItems", () => {
  it("割引明細だけ負数入力を維持する", () => {
    expect(sanitizeSignedYenInput("クーポン券割引", "-")).toBe("-");
    expect(sanitizeSignedYenInput("クーポン券割引", "-110")).toBe("-110");
    expect(sanitizeSignedYenInput("キュレル ジェルメイク", "-110")).toBe("110");
  });

  it("値引き・クーポン・割戻しを割引明細として判定する", () => {
    expect(isDiscountItemName("クーポン券割引 10% ")).toBe(true);
    expect(isDiscountItemName("商品値引き")).toBe(true);
    expect(isDiscountItemName("ポイント割戻し")).toBe(true);
    expect(isDiscountItemName("消費税計")).toBe(false);
  });
});
