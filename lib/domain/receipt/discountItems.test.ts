import { describe, expect, it } from "vitest";
import {
  isDiscountItemName,
  isValidSignedLineItemAmount,
  sanitizeSignedYenInput,
} from "./discountItems";

describe("isDiscountItemName", () => {
  it.each([
    ["クーポン券割引 10%", true],
    ["商品値引き", true],
    ["ポイント割戻し", true],
    ["ポイント利用", true],
    ["ポイント充当", true],
    ["割り戻", true],
    ["消費税計", false],
    [" 割引 ", true],
  ])("%s -> %s", (itemName, expected) => {
    expect(isDiscountItemName(itemName)).toBe(expected);
  });
});

describe("isValidSignedLineItemAmount", () => {
  it.each([
    ["食料品", 1000, true],
    ["食料品", -1000, false],
    ["割引", -1000, true],
    ["割引", 0, false],
    ["不明な明細", 0, false],
    ["割引", 1.5, false],
  ])("%s / %s -> %s", (itemName, amountYen, expected) => {
    expect(isValidSignedLineItemAmount(itemName, amountYen)).toBe(expected);
  });
});

describe("explicit receipt item line type", () => {
  it("品名に値引き語がなくても販促調整の負額を許容する", () => {
    expect(isValidSignedLineItemAmount("M001 東洋水産よりどり", -10, "promotion_adjustment")).toBe(
      true,
    );
  });

  it("通常商品と不明行の負額を確定値として許容しない", () => {
    expect(isValidSignedLineItemAmount("商品", -10, "item")).toBe(false);
    expect(isValidSignedLineItemAmount("商品", -10, "unknown")).toBe(false);
  });

  it("不明な負額行はレビュー中のマイナス入力を維持する", () => {
    expect(sanitizeSignedYenInput("M002 玉ねぎ3玉", "-16", "unknown")).toBe("-16");
  });
});

describe("sanitizeSignedYenInput", () => {
  it("割引明細は負数入力を維持する", () => {
    expect(sanitizeSignedYenInput("クーポン券割引", "-")).toBe("-");
    expect(sanitizeSignedYenInput("クーポン券割引", "-110")).toBe("-110");
  });

  it("通常明細は符号を除去する", () => {
    expect(sanitizeSignedYenInput("キュレル ジェルメイク", "-110")).toBe("110");
  });

  it("空・非数字は空文字にする", () => {
    expect(sanitizeSignedYenInput("クーポン券割引", "")).toBe("");
    expect(sanitizeSignedYenInput("クーポン券割引", "abc")).toBe("");
  });
});
