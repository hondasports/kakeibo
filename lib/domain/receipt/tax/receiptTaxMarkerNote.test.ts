import { describe, expect, it } from "vitest";
import { deriveReceiptTaxSummaries } from "./deriveReceiptTaxSummaries";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { receiptTaxBasisInput } from "./fixtures/receiptTaxBasisCases";
import { observationLine } from "./fixtures/unprovenTargetReceipt";

const input = receiptTaxBasisInput({
  amounts: [108, 138],
  taxYen: 19,
  paidYen: 265,
  allocations: [8, 11],
});
const lines = [
  observationLine("8%対象額 246円", 246, 0),
  observationLine("外税8% 19円", 19, 1),
  observationLine("合計 265円", 265, 2),
  {
    ...observationLine("※印は軽減税率対象商品です。", 0, 3),
    amountYen: null,
    amountText: null,
    lineRoleCandidates: ["unknown" as const],
  },
];

describe("軽減税率マーカーの説明", () => {
  it.each(["※印は軽減税率対象商品です。", "※印は軽減税率（8%）対象商品です。"])(
    "注記を税内訳と誤認せず、印字税額を配分する: %s",
    (note) => {
      const result = reinterpretDraftTax({
        ...input,
        rawObservationLines: [...lines.slice(0, 3), { ...lines[3], rawText: note }],
        receiptLineClassifications: [
          {
            sourceLineIndex: 3,
            status: "ambiguous",
            candidates: [{ role: "unknown", score: 1, evidence: [] }],
          },
        ],
      });
      expect(result.interpretation.taxSummaries[0].warnings).not.toContain(
        "contradictory_receipt_tax_evidence",
      );
      expect(result.itemFields.map((item) => item.normalizedAmountYen)).toEqual([116, 149]);
      expect(result.itemFields.map((item) => item.taxAllocationStatus)).toEqual([
        "allocated",
        "allocated",
      ]);
    },
  );

  it("税と分類されたマーカー説明も税内訳の矛盾にしない", () => {
    const result = reinterpretDraftTax({
      ...input,
      rawObservationLines: [...lines.slice(0, 3), { ...lines[3], lineRoleCandidates: ["tax"] }],
    });
    expect(result.interpretation.taxSummaries[0].status).toBe("verified");
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
  });

  it("印字税額が矛盾すれば注記があっても確定しない", () => {
    const badTax = { ...lines[1], rawText: "外税8% 20円", amountYen: 20, amountText: "20円" };
    const result = reinterpretDraftTax({
      ...input,
      rawObservationLines: [lines[0], badTax, ...lines.slice(2)],
    });
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });

  it("金額を読めない対象額行は矛盾として保持する", () => {
    const missingTarget = { ...lines[0], amountYen: null, amountText: null };
    const summaries = deriveReceiptTaxSummaries({
      ...input,
      lines: [missingTarget, ...lines.slice(1)],
    });
    expect(summaries[0].warnings).toContain("contradictory_receipt_tax_evidence");
  });
});
