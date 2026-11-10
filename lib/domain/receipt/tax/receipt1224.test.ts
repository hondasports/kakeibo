import { expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { classifications, lines, mkItems, sourceTaxSummaries } from "./fixtures/receipt1220";

function receipt(zeroTarget = 100) {
  const items = mkItems("unknown").map((item: any) => ({
    ...item,
    taxResolutionStatus: "unresolved",
    taxConfirmedFields: [],
  }));
  items.push({
    ...items[0],
    id: "exempt",
    itemName: "非課税商品",
    amountYen: "100",
    printedAmountYen: 100,
    taxRatePercent: 0,
    amountBasis: "tax_excluded",
    markers: [],
  });
  const zeroSummary = {
    taxRatePercent: 0,
    taxableAmountYen: 100,
    taxYen: 0,
    taxIncludedAmountYen: 100,
    taxMode: "external",
    taxableAmountBasis: "tax_excluded",
    roundingMethod: "unknown",
    status: "verified",
    reasons: [],
    warnings: [],
  };
  const observationLines = [
    ...lines.filter((line) => line.sourceLineIndex <= 13),
    {
      ...lines[12],
      sourceLineIndex: 22,
      rawText: `0%対象 ${zeroTarget}円`,
      amountText: String(zeroTarget),
      amountYen: zeroTarget,
    },
    { ...lines[14], rawText: "合計 942円", amountText: "942", amountYen: 942 },
  ];
  return {
    amountYen: 942,
    items,
    taxSummaries: [...sourceTaxSummaries, zeroSummary],
    sourceTaxSummaries: [...sourceTaxSummaries, zeroSummary],
    rawObservationLines: observationLines,
    receiptLineClassifications: classifications.filter((entry: any) => entry.sourceLineIndex <= 14),
  };
}

it("0%対象額だけの印字でも8%明細に税抜の税額を配分する", () => {
  const result = reinterpretDraftTax(receipt() as never);
  expect(result.itemFields.slice(0, 5).map((item) => item.amountBasis)).toEqual(
    Array(5).fill("tax_excluded"),
  );
  expect(result.itemFields.slice(0, 5).map((item) => item.taxAllocationStatus)).toEqual(
    Array(5).fill("allocated"),
  );
  expect(result.itemFields.slice(0, 5).map((item) => item.allocatedTaxYen)).toEqual([
    13, 12, 11, 13, 13,
  ]);
});

it("0%の印字対象額がサマリと異なる場合は8%明細を自動補完しない", () => {
  const result = reinterpretDraftTax(receipt(101) as never);
  expect(result.itemFields.slice(0, 5).map((item) => item.amountBasis)).toEqual(
    Array(5).fill("unknown"),
  );
  expect(result.itemFields.slice(0, 5).map((item) => item.taxAllocationStatus)).toEqual(
    Array(5).fill("unallocated"),
  );
});
