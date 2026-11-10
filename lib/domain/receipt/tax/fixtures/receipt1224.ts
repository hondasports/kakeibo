import { classifications, lines, mkItems, sourceTaxSummaries } from "./receipt1220";

export function receipt1224(zeroTarget = 100) {
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
