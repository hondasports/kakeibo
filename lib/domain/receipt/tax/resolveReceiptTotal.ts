import type { ExtractedTaxSummary, ReceiptTotalCandidate, ReceiptTotalResolution } from "./types";
import { distinctTaxSummaryAmounts } from "./taxAmountBasis";

function addCandidate(candidates: ReceiptTotalCandidate[], candidate: ReceiptTotalCandidate) {
  if (
    candidates.some(
      (existing) =>
        existing.amountYen === candidate.amountYen &&
        existing.source === candidate.source &&
        existing.evidence === candidate.evidence,
    )
  ) {
    return;
  }
  candidates.push(candidate);
}

function collectTaxCandidates(
  candidates: ReceiptTotalCandidate[],
  summaries: ExtractedTaxSummary[],
) {
  const distinct = distinctTaxSummaryAmounts(summaries);
  if (distinct.length !== 1) {
    return;
  }
  distinct.forEach((summary, index) => {
    if (summary.taxIncludedAmountYen !== undefined) {
      addCandidate(candidates, {
        amountYen: summary.taxIncludedAmountYen,
        source: "tax_summary_total",
        evidence: `taxSummaries[${index}].taxIncludedAmountYen`,
      });
    }
    if (summary.taxMode === "included" && summary.taxableAmountBasis === "tax_included") {
      addCandidate(candidates, {
        amountYen: summary.taxableAmountYen,
        source: "tax_arithmetic",
        evidence: `taxSummaries[${index}].taxableAmountYen`,
      });
    }
    if (summary.taxMode === "external" && summary.taxableAmountBasis === "tax_excluded") {
      addCandidate(candidates, {
        amountYen: summary.taxableAmountYen + summary.taxYen,
        source: "tax_arithmetic",
        evidence: `taxSummaries[${index}].taxableAmountYen + taxYen`,
      });
    }
  });
}

export function resolveReceiptTotal(args: {
  amountYen: number | null;
  source?: "explicit_label" | "user_confirmed" | "ai_estimate";
  confidence?: number;
  supportingCandidates?: ReceiptTotalCandidate[];
  taxSummaries: ExtractedTaxSummary[];
}): ReceiptTotalResolution {
  const source = args.source ?? "ai_estimate";
  const candidates: ReceiptTotalCandidate[] = [];
  if (args.amountYen !== null) {
    candidates.push({
      amountYen: args.amountYen,
      source,
      evidence: source === "user_confirmed" ? "review.amountYen" : "extraction.amountYen",
    });
  }
  for (const candidate of args.supportingCandidates ?? []) {
    addCandidate(candidates, candidate);
  }
  collectTaxCandidates(candidates, args.taxSummaries);

  const distinctAmounts = new Set(candidates.map((candidate) => candidate.amountYen));
  if (
    args.amountYen === null ||
    !Number.isInteger(args.amountYen) ||
    args.amountYen < 1 ||
    args.amountYen > 9_999_999
  ) {
    return {
      status: "ambiguous",
      protectedAmountYen: args.amountYen,
      candidates,
      reasons: ["receipt_total_missing_or_invalid"],
    };
  }
  if (source === "user_confirmed") {
    return {
      status: "verified",
      protectedAmountYen: args.amountYen,
      candidates,
      reasons: distinctAmounts.size > 1 ? ["user_confirmed_total_precedes_tax_candidates"] : [],
    };
  }
  if (source === "ai_estimate") {
    return {
      status: "ambiguous",
      protectedAmountYen: args.amountYen,
      candidates,
      reasons: ["receipt_total_source_unverified"],
    };
  }
  if (args.confidence !== undefined && args.confidence < 0.8) {
    return {
      status: "ambiguous",
      protectedAmountYen: args.amountYen,
      candidates,
      reasons: ["receipt_total_low_confidence"],
    };
  }
  if (distinctAmounts.size > 1) {
    return {
      status: "ambiguous",
      protectedAmountYen: args.amountYen,
      candidates,
      reasons: ["multiple_receipt_total_candidates"],
    };
  }
  return {
    status: "verified",
    protectedAmountYen: args.amountYen,
    candidates,
    reasons: [],
  };
}
