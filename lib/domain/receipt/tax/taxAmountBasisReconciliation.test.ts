import { describe, expect, it } from "vitest";
import { interpretReceiptTax } from "./interpretReceiptTax";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { receiptTaxBasisCases, receiptTaxBasisInput } from "./fixtures/receiptTaxBasisCases";

describe("Issue #890: 商品価格と税率別対象額の基準換算", () => {
  it.each(receiptTaxBasisCases)("税抜明細を税込対象額$paidYen 円と照合する", (testCase) => {
    const input = receiptTaxBasisInput(testCase);
    const original = structuredClone(input);
    const result = interpretReceiptTax(input);
    expect(result.items.map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
    expect(result.items.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(result.items.map((item) => item.normalizedAmountYen)).toEqual(
      testCase.amounts.map((amount, index) => amount + testCase.allocations[index]),
    );
    expect(result.items.map((item) => item.amountBasis)).toEqual(
      testCase.amounts.map(() => "tax_excluded"),
    );
    expect(result.items.map((item) => item.printedAmountYen)).toEqual(testCase.amounts);
    expect(result.taxSummaries[0]).toMatchObject(original.taxSummaries[0]);
    expect(result.warnings).toEqual([]);
    expect(result.decision.resolutionStatus).not.toBe("contradictory");
    expect(input).toEqual(original);
  });

  it.each([false, true])("同値の税込・税抜内訳を順序%sでも一度だけ配分する", (reverse) => {
    const testCase = receiptTaxBasisCases[0];
    const input = receiptTaxBasisInput(testCase);
    input.taxSummaries.push({
      ...input.taxSummaries[0],
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      taxableAmountYen: 404,
    });
    if (reverse) input.taxSummaries.reverse();
    const result = interpretReceiptTax(input);
    expect(result.items.map((item) => item.allocatedTaxYen)).toEqual([8, 11, 13]);
    expect(result.items.map((item) => item.normalizedAmountYen)).toEqual([106, 149, 181]);
    expect(result.taxSummaries).toHaveLength(2);
    expect(result.taxSummaries.every((summary) => summary.status === "verified")).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.decision.resolutionStatus).not.toBe("contradictory");
    expect(result.decision.taxAmount.estimatedTaxYen).toBe(32);
  });

  it("税込明細を税抜対象額へ換算しても印字価格を保持する", () => {
    const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
    input.items = [106, 149, 181].map((printedAmountYen, index) => ({
      ...input.items[index],
      printedAmountYen,
      amountBasis: "tax_included",
    }));
    input.taxSummaries[0] = {
      ...input.taxSummaries[0],
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      taxableAmountYen: 404,
    };
    const result = interpretReceiptTax(input);
    expect(result.items.map((item) => item.normalizedAmountYen)).toEqual([106, 149, 181]);
    expect(result.items.map((item) => item.allocatedTaxYen)).toEqual([8, 11, 13]);
    expect(result.warnings).toEqual([]);
  });

  it("割引を含む税抜小計384円と税込対象額414円を厳密に照合する", () => {
    const input = receiptTaxBasisInput({
      amounts: [98, 138, 168, -20],
      taxYen: 30,
      paidYen: 414,
      allocations: [8, 11, 13, -2],
    });
    const result = interpretReceiptTax(input);
    expect(result.items.map((item) => item.allocatedTaxYen)).toEqual([8, 11, 13, -2]);
    expect(result.items.reduce((sum, item) => sum + item.normalizedAmountYen, 0)).toBe(414);
    expect(result.warnings).toEqual([]);
  });

  it.each(["taxYen", "taxableAmountYen", "amountYen"] as const)(
    "%sが矛盾する入力は税額配分を確定しない",
    (field) => {
      const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
      if (field === "amountYen") input.amountYen += 1;
      else input.taxSummaries[0][field] += 1;
      const result = interpretReceiptTax(input);
      expect(result.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
    },
  );

  it.each(["rate", "basis"])("%sが未確定なら基準換算だけで明細を確定しない", (field) => {
    const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
    if (field === "rate")
      input.items.forEach((item) => {
        item.taxRatePercent = null;
      });
    else
      input.items.forEach((item) => {
        item.amountBasis = "unknown";
      });
    const result = interpretReceiptTax(input);
    if (field === "rate")
      expect(result.items.every((item) => item.taxContext.status === "unresolved")).toBe(true);
    expect(result.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  });

  describe.each([false, true])("税込・税抜内訳の順序が反転%sの場合の未確定入力", (reverse) => {
    function pairedInput() {
      const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
      input.taxSummaries.push({
        ...input.taxSummaries[0],
        taxMode: "external",
        taxableAmountBasis: "tax_excluded",
        taxableAmountYen: 404,
      });
      if (reverse) input.taxSummaries.reverse();
      return input;
    }

    it.each(["rate", "basis", "both"])("%sを金額一致から推定確定しない", (axis) => {
      const input = pairedInput();
      input.items.forEach((item) => {
        if (axis !== "basis") item.taxRatePercent = null;
        if (axis !== "rate") item.amountBasis = "unknown";
      });
      const result = interpretReceiptTax(input);
      expect(result.items.every((item) => item.taxContext.status === "unresolved")).toBe(true);
      expect(result.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
      expect(result.items.map((item) => item.taxRatePercent)).toEqual(
        input.items.map((item) => item.taxRatePercent),
      );
      expect(result.items.map((item) => item.amountBasis)).toEqual(
        input.items.map((item) => item.amountBasis),
      );
    });

    it("価格区分が未確定でもユーザー指定10%を8%へ上書きしない", () => {
      const input = pairedInput();
      input.items[0].amountBasis = "unknown";
      const { interpretation } = reinterpretDraftTax({
        ...input,
        override: { itemIndex: 0, taxRatePercent: 10 },
      });
      expect(interpretation.items[0]).toMatchObject({
        taxRatePercent: 10,
        amountBasis: "unknown",
        taxContext: { status: "unresolved" },
        taxAllocationStatus: "unallocated",
      });
      expect(interpretation.items.every((item) => item.taxAllocationStatus === "unallocated")).toBe(
        true,
      );
    });
  });

  it("単一の税抜内訳でもユーザー指定10%を金額推定で8%に変更しない", () => {
    const input = receiptTaxBasisInput(receiptTaxBasisCases[0]);
    input.taxSummaries[0] = {
      ...input.taxSummaries[0],
      taxMode: "external",
      taxableAmountBasis: "tax_excluded",
      taxableAmountYen: 404,
    };
    input.items[0].amountBasis = "unknown";
    const { interpretation } = reinterpretDraftTax({
      ...input,
      override: { itemIndex: 0, taxRatePercent: 10 },
    });
    expect(interpretation.items[0]).toMatchObject({
      taxRatePercent: 10,
      amountBasis: "unknown",
      taxContext: { status: "unresolved" },
      taxAllocationStatus: "unallocated",
    });
  });
});
