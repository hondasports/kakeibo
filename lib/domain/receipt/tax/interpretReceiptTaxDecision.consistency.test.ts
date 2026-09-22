import { describe, expect, it } from "vitest";
import { interpretReceiptTaxDecision } from "./interpretReceiptTaxDecision";
import { item, summary, line, classification, baseInput } from "./testHelpers";

describe("interpretReceiptTaxDecision decision table (tax amount consistency)", () => {
  it("summary basis不明を金額矛盾へ格上げしない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        items: [{ ...item("tax_included", 10), printedAmountYen: 1100 }],
        taxSummaries: [
          summary({
            taxMode: "unknown",
            taxableAmountBasis: "unknown",
            status: "verified",
          }),
        ],
      }),
    );

    expect(decision.resolutionStatus).toBe("ambiguous");
    expect(decision.reasons).not.toContain("receipt_reconciliation_mismatch");
  });

  it("税率別明細と税合計の併記を二重加算しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("10% 消費税額 100円", 100, 8), line("税合計 100円", 100, 9)],
        receiptLineClassifications: [classification(8, "tax"), classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount).toMatchObject({ printedTaxYen: 100, source: "printed" });
    expect(decision.reasons).not.toContain("conflicting_printed_tax_lines");
  });

  it("分類情報がなくても明示的な印字税額を認識する", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("消費税額 100円", 100, 9)],
        receiptLineClassifications: undefined,
      }),
    );

    expect(decision.taxAmount).toMatchObject({ printedTaxYen: 100, source: "printed" });
  });

  it("税率ラベルの数値を印字税額として扱わない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [],
        rawObservationLines: [line("消費税 率 10%", 10, 9)],
        receiptLineClassifications: [classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount).toEqual({ roundingMethod: "unknown", source: "unknown" });
  });

  it("税率表記つきgrand totalをrate detailへ二重所属させない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("10% 消費税額 100円", 100, 8), line("10% 税合計 100円", 100, 9)],
        receiptLineClassifications: [classification(8, "tax"), classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount).toMatchObject({ printedTaxYen: 100, source: "printed" });
    expect(decision.reasons).not.toContain("conflicting_printed_tax_lines");
    expect(decision.resolutionStatus).not.toBe("contradictory");
  });

  it("footer税行の具体的な税率文脈をposition sourceとして候補化する", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("税込", 1100, 8), line("標準税 消費税額 100円", 100, 9)],
        receiptLineClassifications: [classification(9, "tax", ["position:receipt_footer"])],
      }),
    );

    expect(decision).toMatchObject({
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionSource: "position",
      resolutionStatus: "verified",
    });
    expect(decision.evidence).toContain("position:receipt_footer_tax_rate_context");
  });

  it("genericなfooter税行だけではAI軸をpositionへ昇格しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("消費税額 100円", 100, 9)],
        receiptLineClassifications: [classification(9, "tax", ["position:receipt_footer"])],
      }),
    );

    expect(decision.resolutionSource).toBe("ai");
    expect(decision.resolutionStatus).toBe("ambiguous");
    expect(decision.evidence).not.toContain("position:receipt_footer_tax_rate_context");
  });

  it("軽減・標準の同額税明細を区分別に合算する", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [
          line("軽減税 消費税額 80円", 80, 8),
          line("標準税 消費税額 80円", 80, 9),
        ],
        receiptLineClassifications: [classification(8, "tax"), classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount.printedTaxYen).toBe(160);
    expect(decision.reasons).not.toContain("conflicting_printed_tax_lines");
  });

  it("税率別明細合計とgrand totalの不一致を矛盾として残す", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [
          line("軽減税 消費税額 80円", 80, 8),
          line("標準税 消費税額 80円", 80, 9),
          line("税合計 100円", 100, 10),
        ],
        receiptLineClassifications: [
          classification(8, "tax"),
          classification(9, "tax"),
          classification(10, "tax"),
        ],
      }),
    );

    expect(decision.taxAmount.printedTaxYen).toBe(100);
    expect(decision.resolutionStatus).toBe("contradictory");
    expect(decision.reasons).toContain("conflicting_printed_tax_lines");
  });

  it("消費税計をgrand totalとして扱い税率別明細との不一致を残す", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("10% 消費税額 100円", 100, 8), line("消費税計 200円", 200, 9)],
        receiptLineClassifications: [classification(8, "tax"), classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount.printedTaxYen).toBe(200);
    expect(decision.resolutionStatus).toBe("contradictory");
    expect(decision.reasons).toContain("conflicting_printed_tax_lines");
  });

  it("generic税額とgrand totalの不一致を矛盾として残す", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("消費税額 80円", 80, 8), line("税合計 100円", 100, 9)],
        receiptLineClassifications: [classification(8, "tax"), classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount.printedTaxYen).toBe(100);
    expect(decision.resolutionStatus).toBe("contradictory");
    expect(decision.reasons).toContain("conflicting_printed_tax_lines");
  });

  it("区分不明の複数generic税明細は税額を確定しない", () => {
    const decision = interpretReceiptTaxDecision(
      baseInput({
        taxSummaries: [summary({ status: "ambiguous" })],
        rawObservationLines: [line("消費税額 80円", 80, 8), line("消費税額 80円", 80, 9)],
        receiptLineClassifications: [classification(8, "tax"), classification(9, "tax")],
      }),
    );

    expect(decision.taxAmount.printedTaxYen).toBeUndefined();
    expect(decision.resolutionStatus).toBe("contradictory");
  });
});
