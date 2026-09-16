import { describe, expect, it } from "vitest";
import { getMockResult } from "./mock";

describe("getMockResult", () => {
  it("mock結果が印字金額と税率別集計を持つ", () => {
    const mock = getMockResult();

    expect(mock.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          printedAmountYen: expect.any(Number),
          amountBasis: "tax_included",
          taxRatePercent: 10,
        }),
      ]),
    );
    expect(mock.taxSummaries).toEqual([
      expect.objectContaining({
        taxRatePercent: 10,
        taxMode: "included",
        taxYen: expect.any(Number),
      }),
    ]);
  });
});
