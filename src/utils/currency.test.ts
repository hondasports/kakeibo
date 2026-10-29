import { describe, expect, it } from "vitest";
import { extractAmountDigits } from "./currency";

describe("extractAmountDigits", () => {
  it.each([
    ["", ""],
    ["320,000円", "320000"],
    ["-100", "100"],
    ["1.5", "15"],
    ["00100", "00100"],
    ["abc", ""],
    ["１２３", ""],
  ])("%s から既存UIと同じASCII数字だけを取り出す", (input, expected) => {
    expect(extractAmountDigits(input)).toBe(expected);
  });
});
