import { describe, expect, it } from "vitest";
import {
  resolveReviewItemAmountsForReplace,
  resolveReviewItemDisplayAmountYen,
} from "./reviewItemAmounts";

describe("resolveReviewItemAmountsForReplace", () => {
  it("外税確定で印字金額が変わらなければ印字額と登録用金額を維持する", () => {
    expect(
      resolveReviewItemAmountsForReplace(298, {
        amountYen: 322,
        printedAmountYen: 298,
        normalizedAmountYen: 322,
        taxResolutionStatus: "resolved",
        amountBasis: "tax_excluded",
      }),
    ).toEqual({
      amountYen: 322,
      printedAmountYen: 298,
      normalizedAmountYen: 322,
    });
  });

  it("外税確定で印字金額を変更したら登録用金額は再計算に任せる", () => {
    expect(
      resolveReviewItemAmountsForReplace(300, {
        amountYen: 322,
        printedAmountYen: 298,
        normalizedAmountYen: 322,
        taxResolutionStatus: "resolved",
        amountBasis: "tax_excluded",
      }),
    ).toEqual({
      amountYen: 300,
      printedAmountYen: 300,
      normalizedAmountYen: undefined,
    });
  });

  it("未確定明細は送信値を印字金額として扱う", () => {
    expect(resolveReviewItemAmountsForReplace(99, undefined)).toEqual({
      amountYen: 99,
      printedAmountYen: 99,
    });
  });
});

describe("resolveReviewItemDisplayAmountYen", () => {
  it("内税確定済みで normalizedAmountYen があればそれを表示する", () => {
    expect(
      resolveReviewItemDisplayAmountYen({
        amountYen: 108,
        printedAmountYen: 108,
        normalizedAmountYen: 100,
        taxResolutionStatus: "resolved",
        amountBasis: "tax_included",
      }),
    ).toBe(100);
  });

  it("外税確定済みは印字金額を表示する", () => {
    expect(
      resolveReviewItemDisplayAmountYen({
        amountYen: 322,
        printedAmountYen: 298,
        normalizedAmountYen: 322,
        taxResolutionStatus: "resolved",
        amountBasis: "tax_excluded",
      }),
    ).toBe(298);
  });

  it("税未確定は印字金額を優先し、なければ登録用金額を表示する", () => {
    expect(
      resolveReviewItemDisplayAmountYen({
        amountYen: 108,
        printedAmountYen: 99,
        normalizedAmountYen: 108,
        taxResolutionStatus: "unresolved",
      }),
    ).toBe(99);

    expect(
      resolveReviewItemDisplayAmountYen({
        amountYen: 108,
        normalizedAmountYen: 108,
        taxResolutionStatus: "unresolved",
      }),
    ).toBe(108);
  });

  it("印字・正規化どちらも無い保存済み行は登録用金額を表示する", () => {
    // printedAmountYen 導入前や未導入経路で作られた行は両方を持たない
    expect(
      resolveReviewItemDisplayAmountYen({ amountYen: 108, taxResolutionStatus: "unresolved" }),
    ).toBe(108);
  });
});
