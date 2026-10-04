import type { ExtractedTaxSummary, ReceiptTaxInput, ReconciliationResult } from "./types";
import { equivalentTaxSummaryAmounts } from "./taxAmountBasis";

function summaryKey(summary: ExtractedTaxSummary) {
  return [
    summary.taxRatePercent,
    summary.taxMode,
    summary.taxableAmountYen,
    summary.taxableAmountBasis,
    summary.taxYen,
    summary.taxIncludedAmountYen ?? "",
  ].join(":");
}

export function reconcileTaxSummaries(input: ReceiptTaxInput): ReconciliationResult {
  const seen = new Set<string>();
  const duplicateRates = new Set<number>();
  const taxSummaries = input.taxSummaries.filter((summary) => {
    const key = summaryKey(summary);
    if (seen.has(key)) {
      duplicateRates.add(summary.taxRatePercent);
      return false;
    }
    seen.add(key);
    return true;
  });
  const summariesByRate = new Map<number, ExtractedTaxSummary[]>();
  for (const summary of taxSummaries) {
    const group = summariesByRate.get(summary.taxRatePercent) ?? [];
    group.push(summary);
    summariesByRate.set(summary.taxRatePercent, group);
  }
  const conflictingRates = new Set(
    [...summariesByRate]
      .filter(
        ([, group]) =>
          group.length > 1 &&
          group.some((summary) => !equivalentTaxSummaryAmounts(group[0], summary)),
      )
      .map(([rate]) => rate),
  );
  return {
    taxSummaries,
    resolvableTaxSummaries: taxSummaries.filter(
      (summary) => !conflictingRates.has(summary.taxRatePercent),
    ),
    duplicateWarnings: [...duplicateRates].map((rate) => `duplicate_tax_summary:${rate}`),
    conflictingWarnings: [...conflictingRates].map((rate) => `conflicting_tax_summary:${rate}`),
  };
}
