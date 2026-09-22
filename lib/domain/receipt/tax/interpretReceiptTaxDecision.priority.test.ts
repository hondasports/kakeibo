import { describe, expect, it } from "vitest";
import { interpretReceiptTaxDecision } from "./interpretReceiptTaxDecision";
import { item, summary, line, classification, baseInput } from "./testHelpers";

describe("interpretReceiptTaxDecision decision table (priority and verification)", () => {
  it("ユーザー補正をAI・算術より優先する", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        userOverride: { priceTaxTreatment: "perItem", taxRateComposition: "mixed" },
        items: [item("tax_excluded", 8), item("tax_included", 10)],
        taxSummaries: [summary({ roundingMethod: "round", status: "ambiguous" })],
        rawObservationLines: [line("消費税額 100円", 100, 8)],
        receiptLineClassifications: [classification(8, "tax")],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "perItem",
      taxRateComposition: "mixed",
      resolutionStatus: "verified",
      resolutionSource: "user",
    });
  });

  it("明示ラベルで税込と10%を独立してverifiedにする", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        rawObservationLines: [line("税込 10% 消費税額 100円", 100, 8)],
        receiptLineClassifications: [classification(8, "tax", ["position:receipt_footer"])],
        taxSummaries: [summary({ status: "ambiguous" })],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      taxAmount: { printedTaxYen: 100, source: "printed" },
    });
  });

  it("税込・税抜商品の混在をperItem、8%・10%をmixedとして別軸にする", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("tax_included", 8), item("tax_excluded", 10)],
        rawObservationLines: [
          line("税込商品 8%", 500, 1, "item"),
          line("税抜商品 10%", 500, 2, "item"),
          line("消費税額", 50, 9),
        ],
        receiptLineClassifications: [classification(9, "tax")],
        taxSummaries: [summary({ status: "ambiguous" })],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "perItem",
      taxRateComposition: "mixed",
      resolutionStatus: "verified",
    });
  });

  it("価格表示は明示ラベル、税率構成はマーカー凡例でverifiedにする", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("tax_included", 8), item("tax_included", 10)],
        rawObservationLines: [line("税込", 1100, 8), line("消費税額 100円", 100, 9)],
        receiptLineClassifications: [classification(9, "tax")],
        taxSummaries: [summary({ status: "ambiguous" })],
        markerDefinitions: [
          { marker: "*", description: "軽減税率8%" },
          { marker: "#", description: "標準税率10%" },
        ],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "mixed",
      resolutionStatus: "verified",
      resolutionSource: "marker",
    });
    expect(decision.evidence).toEqual(expect.arrayContaining(["marker_legend:rate_8"]));
  });

  it("AI抽出と算術一致だけではverifiedにしない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        amountYen: 1100,
        items: [item("unknown", null)],
        taxSummaries: [
          summary({
            taxMode: "unknown",
            taxableAmountBasis: "unknown",
            taxableAmountYen: 1000,
            taxYen: 100,
            status: "ambiguous",
          }),
        ],
      }),
    );

    expect(decision.resolutionStatus).toBe("ambiguous");
    expect(decision.reasons).toContain("insufficient_primary_evidence");
    expect(decision.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priceTaxTreatment: "excluded",
          resolutionSource: "ai",
          resolutionStatus: "ambiguous",
        }),
      ]),
    );
  });

  it("既知basisにunknownが混ざる場合は価格扱いを確定しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [item("tax_included", 10), item("unknown", 10)],
        taxSummaries: [summary({ status: "ambiguous" })],
      }),
    );

    expect(decision.priceTaxTreatment).toBe("unknown");
    expect(decision.resolutionStatus).toBe("ambiguous");
  });

  it("完全照合済み集計をAI・算術より優先する", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [{ ...item("tax_included", 10), printedAmountYen: 1100 }],
        taxSummaries: [summary({ roundingMethod: "floor" })],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "reconciliation",
      taxAmount: { source: "estimated", roundingMethod: "floor" },
    });
    expect(decision.evidence).toEqual(
      expect.arrayContaining([
        "reconciliation:treatment_included",
        "reconciliation:composition_rate10",
      ]),
    );
  });
});
