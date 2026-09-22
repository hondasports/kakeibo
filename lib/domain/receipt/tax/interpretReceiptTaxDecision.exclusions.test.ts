import { describe, expect, it } from "vitest";
import { interpretReceiptTaxDecision } from "./interpretReceiptTaxDecision";
import { item, summary, line, classification, baseInput } from "./testHelpers";

describe("interpretReceiptTaxDecision decision table (evidence exclusions)", () => {
  it("免税・インボイス事業者表記だけでは税額0や非課税を確定しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("unknown", null)],
        taxSummaries: [],
        rawObservationLines: [line("適格請求書発行事業者ではない", null, 9)],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
      resolutionStatus: "ambiguous",
      taxAmount: { source: "unknown" },
    });
  });

  it("税額0だけでは税率構成を確定しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("tax_included", 0)],
        taxSummaries: [summary({ taxRatePercent: 0, taxYen: 0, status: "ambiguous" })],
        rawObservationLines: [line("税込 税額0円", 0, 9)],
        receiptLineClassifications: [classification(9, "tax")],
      }),
    );

    expect(decision.taxRateComposition).toBe("unknown");
    expect(decision.resolutionStatus).toBe("ambiguous");
  });

  it("印字税額がなければ推定税額として分離し、丸め不明ならambiguousにする", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [{ ...item("tax_included", 10), printedAmountYen: 1100 }],
        rawObservationLines: [line("税込 10%", 1100, 8)],
        taxSummaries: [summary()],
      }),
    );

    expect(decision.taxAmount).toEqual({
      estimatedTaxYen: 100,
      roundingMethod: "unknown",
      source: "estimated",
    });
    expect(decision.resolutionStatus).toBe("ambiguous");
    expect(decision.reasons).toContain("estimated_tax_with_unknown_rounding");
  });

  it("未検証summaryの税額を推定してverifiedにしない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        rawObservationLines: [line("税込 10%", null, 8)],
        taxSummaries: [summary({ status: "ambiguous", roundingMethod: "floor" })],
      }),
    );

    expect(decision.taxAmount).toEqual({ roundingMethod: "floor", source: "unknown" });
    expect(decision.resolutionStatus).toBe("ambiguous");
    expect(decision.reasons).toContain("unverified_tax_summary_for_estimate");
  });

  it("矛盾summaryがあれば明示ラベルがあってもcontradictoryにする", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        rawObservationLines: [line("税込 10% 消費税額100円", 100, 9)],
        receiptLineClassifications: [classification(9, "tax")],
        taxSummaries: [summary({ status: "contradictory" })],
      }),
    );

    expect(decision.resolutionStatus).toBe("contradictory");
    expect(decision.reasons).toContain("contradictory_tax_summary");
  });

  it("値引き・ポイント・手数料・決済行を税証拠にせず除外根拠を残す", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        rawObservationLines: [line("税込 10% 消費税額100円", 100, 9)],
        receiptLineClassifications: [
          classification(2, "coupon"),
          classification(3, "pointsUsed"),
          classification(4, "fee"),
          classification(5, "paymentMethodAmount"),
          classification(9, "tax"),
        ],
        taxSummaries: [summary({ status: "ambiguous" })],
      }),
    );

    expect(decision.resolutionStatus).toBe("verified");
    expect(decision.reasons).toContain("non_tax_adjustment_lines_excluded");
  });

  it("決済行の税込・税率表記を税判断の証拠にしない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("unknown", null)],
        taxSummaries: [summary({ status: "ambiguous", taxableAmountBasis: "unknown" })],
        rawObservationLines: [line("カード決済 税抜 10%", 1100, 12, "payment")],
        receiptLineClassifications: undefined,
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "ambiguous",
    });
    expect(decision.evidence).not.toContain("explicit_label:excluded");
    expect(decision.reasons).toContain("non_tax_adjustment_lines_excluded");
  });

  it("分類なし決済行の税額ラベルを印字税額として扱わない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("unknown", null)],
        taxSummaries: [],
        rawObservationLines: [line("カード決済 消費税額100円", 100, 12, "payment")],
        receiptLineClassifications: undefined,
      }),
    );

    expect(decision.taxAmount).toEqual({ roundingMethod: "unknown", source: "unknown" });
    expect(decision.reasons).toContain("non_tax_adjustment_lines_excluded");
  });

  it("ambiguousなtax/payment分類を税証拠から除外する", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("unknown", null)],
        taxSummaries: [],
        rawObservationLines: [line("カード決済 税込 10% 消費税額100円", 100, 12, "tax")],
        receiptLineClassifications: [
          {
            sourceLineIndex: 12,
            status: "ambiguous",
            candidates: [
              { role: "tax", score: 0.5, evidence: [] },
              { role: "paymentMethodAmount", score: 0.5, evidence: [] },
            ],
          },
        ],
      }),
    );

    expect(decision.taxAmount).toEqual({ roundingMethod: "unknown", source: "unknown" });
    expect(decision.evidence).not.toContain("explicit_label:included");
    expect(decision.reasons).toContain("non_tax_adjustment_lines_excluded");
  });

  it("raw行がなくてもambiguous分類のnon-tax候補を除外理由に残す", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("unknown", null)],
        taxSummaries: [],
        rawObservationLines: undefined,
        receiptLineClassifications: [
          {
            sourceLineIndex: 12,
            status: "ambiguous",
            candidates: [
              { role: "tax", score: 0.5, evidence: [] },
              { role: "paymentMethodAmount", score: 0.5, evidence: [] },
            ],
          },
        ],
      }),
    );

    expect(decision.reasons).toContain("non_tax_adjustment_lines_excluded");
  });

  it("itemとsummaryのbasis不一致をperItem商品混在にしない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("tax_excluded", 10)],
      }),
    );

    expect(decision.priceTaxTreatment).not.toBe("perItem");
    expect(decision.resolutionStatus).toBe("contradictory");
    expect(decision.reasons).toContain("receipt_reconciliation_mismatch");
  });

  it("税率だけのuser overrideは価格軸をuserへ昇格しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        userOverride: { taxRateComposition: "rate8" },
        items: [item("tax_excluded", 8)],
        taxSummaries: [summary({ status: "ambiguous", taxRatePercent: 8 })],
        rawObservationLines: [line("税込", 1100, 8)],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "rate8",
      resolutionSource: "explicitLabel",
    });
    expect(decision.evidence).toEqual(
      expect.arrayContaining(["explicit_label:included", "user_override:composition"]),
    );
    expect(decision.evidence).not.toContain("user_override:treatment");
  });

  it("税率別summary合計が支払総額と不一致なら全体照合済みにしない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        amountYen: 2000,
        items: [item("tax_included", 8), item("tax_included", 10)],
        taxSummaries: [
          summary({ taxRatePercent: 8, taxableAmountYen: 1000, taxYen: 74 }),
          summary({ taxRatePercent: 10, taxableAmountYen: 900, taxYen: 82 }),
        ],
      }),
    );

    expect(decision.resolutionStatus).toBe("contradictory");
    expect(decision.reasons).toContain("receipt_reconciliation_mismatch");
    expect(decision.resolutionSource).not.toBe("reconciliation");
  });
});
