import type { AmountBasis, ExtractedTaxSummary } from "./types";

export function resolveAmountBasis(
  summary: Pick<ExtractedTaxSummary, "taxableAmountBasis" | "taxMode">,
): AmountBasis {
  if (summary.taxableAmountBasis !== "unknown") return summary.taxableAmountBasis;
  if (summary.taxMode === "external") return "tax_excluded";
  if (summary.taxMode === "included") return "tax_included";
  return "unknown";
}
