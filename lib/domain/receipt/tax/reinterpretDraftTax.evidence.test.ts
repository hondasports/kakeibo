import { describe, expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { observationLine, unprovenTargetReceipt } from "./fixtures/unprovenTargetReceipt";

describe("出所不明の対象額の再計算", () => {
  it("商品確認だけで4,810円と437円を整合させ、元の対象額と原文を保持する", () => {
    const input = unprovenTargetReceipt();
    input.items[0].warnings = ["amount_mismatch", "unresolved_tax_rate", "unresolved_amount_basis"];
    const original = structuredClone(input);
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
      valueOrigin: { source: "items", previousTaxableAmountYen: 4373 },
    });
    expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(result.itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0)).toBe(437);
    expect(
      result.itemFields.every(
        (item) =>
          !item.warnings.some((warning) =>
            ["amount_mismatch", "unresolved_tax_rate", "unresolved_amount_basis"].includes(warning),
          ),
      ),
    ).toBe(true);
    expect(input).toEqual(original);
    const reopened = reinterpretDraftTax({
      ...input,
      taxSummaries: result.interpretation.taxSummaries,
    });
    expect(reopened.itemFields).toEqual(result.itemFields);
  });

  it.each([8, 10] as const)("%s%%外税でも原文の合計と税額の両方で照合する", (rate) => {
    const input = unprovenTargetReceipt();
    input.amountYen = 1000 + rate * 10;
    input.items = [
      {
        itemName: "商品",
        printedAmountYen: 1000,
        amountBasis: "tax_excluded",
        taxRatePercent: rate,
      },
    ];
    input.taxSummaries = [
      { ...input.taxSummaries[0], taxRatePercent: rate, taxableAmountYen: 800, taxYen: rate * 10 },
    ];
    input.rawObservationLines = [
      observationLine(`合計 ${input.amountYen}円`, input.amountYen, 0),
      observationLine(`消費税${rate}% ${rate * 10}円`, rate * 10, 1),
    ];
    const result = reinterpretDraftTax(input);
    expect(result.itemFields[0]).toMatchObject({
      normalizedAmountYen: input.amountYen,
      allocatedTaxYen: rate * 10,
      taxAllocationStatus: "allocated",
    });
  });

  it("原文の外税ラベルと商品の税込指定が矛盾する場合は補正しない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![1].rawText = "外税10% 437円";
    input.taxSummaries[0].taxMode = "external";
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it.each(["10%税込", "10%合計", "10%課税売上", "10%対象"])(
    "別形式の印字対象額 %s も上書きしない",
    (label) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines!.push(observationLine(`${label} 4,373円`, 4373, 2));
      expect(reinterpretDraftTax(input).interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    },
  );

  it("印字対象額やユーザー修正値は自動上書きしない", () => {
    for (const mode of ["printed", "user", "legacy-user"] as const) {
      const input = unprovenTargetReceipt();
      if (mode === "printed")
        input.rawObservationLines!.push(observationLine("10%対象 4,373円", 4373, 2));
      if (mode === "user") input.taxSummaries[0].valueOrigin = { source: "user" };
      if (mode === "legacy-user") input.taxSummariesUserConfirmed = true;
      const result = reinterpretDraftTax(input);
      expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
      expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
        true,
      );
    }
  });

  it("全体税区分を選んでも独立した印字矛盾は捨てない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines!.push(observationLine("10%対象 4,373円", 4373, 2));
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0].taxableAmountYen).toBe(4373);
    expect(result.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  it("原文のない全体設定が再表示時に手修正した対象額を捨てない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = undefined;
    input.summaryOverride = { index: 0, summary: { taxableAmountYen: 4800 } };
    input.decisionOverride = { priceTaxTreatment: "included", taxRateComposition: "rate10" };
    const saved = reinterpretDraftTax(input);
    const reopened = reinterpretDraftTax({
      ...input,
      summaryOverride: undefined,
      taxSummaries: saved.interpretation.taxSummaries,
    });
    expect(saved.interpretation.taxSummaries[0].taxableAmountYen).toBe(4800);
    expect(reopened.interpretation.taxSummaries[0]).toEqual(saved.interpretation.taxSummaries[0]);
    expect(reopened.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });

  it("手修正の根拠を保存し、その後の商品変更で上書きしない", () => {
    const input = unprovenTargetReceipt();
    input.summaryOverride = { index: 0, summary: { taxableAmountYen: 4800 } };
    const result = reinterpretDraftTax(input);
    expect(result.interpretation.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4800,
      valueOrigin: { source: "user" },
    });
    expect(
      reinterpretDraftTax({
        ...input,
        summaryOverride: undefined,
        taxSummaries: result.interpretation.taxSummaries,
      }).interpretation.taxSummaries[0].taxableAmountYen,
    ).toBe(4800);
  });
});
