import { describe, expect, it } from "vitest";
import { calculateTaxYen } from "./calculateTax";

describe("calculateTaxYen", () => {
  it.each([
    [1559, 8, "floor", 124],
    [1559, 8, "round", 125],
    [1559, 8, "ceil", 125],
    [999, 10, "floor", 99],
    [999, 10, "round", 100],
    [999, 10, "ceil", 100],
    [1000, 10, "floor", 100],
    [1559, 0, "ceil", 0],
    [101, 8, "floor", 8],
    [101, 8, "round", 8],
    [101, 8, "ceil", 9],
    [25, 10, "floor", 2],
    [25, 10, "round", 3],
    [25, 10, "ceil", 3],
  ] as const)(
    "%i円 税率%i%% %s => %i円",
    (taxableAmountYen, taxRatePercent, roundingMethod, expected) => {
      expect(calculateTaxYen({ taxableAmountYen, taxRatePercent, roundingMethod })).toBe(expected);
    },
  );

  it.each([
    { taxableAmountYen: -1, taxRatePercent: 8, roundingMethod: "floor" },
    { taxableAmountYen: 1.5, taxRatePercent: 8, roundingMethod: "floor" },
    { taxableAmountYen: 100, taxRatePercent: 0.08, roundingMethod: "floor" },
    { taxableAmountYen: 100, taxRatePercent: 8, roundingMethod: "truncate" },
  ])("不正入力を拒否する", (args) => {
    expect(() => calculateTaxYen(args as never)).toThrow();
  });
});
