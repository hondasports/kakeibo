import type {
  ExtractedTaxSummary,
  PriceTaxTreatment,
  ReceiptTaxAmountDecision,
  ReceiptTaxDecision,
  ReceiptTaxDecisionCandidate,
  ReceiptTaxDecisionSource,
  ReceiptTaxInput,
  RoundingMethod,
  TaxRateComposition,
} from "./types";
import { canonicalTaxSummaryStatus } from "./taxSummaryConsistency";
import type { AxisEvidence } from "./interpretTaxEvidence";
import {
  TAX_AMOUNT_LABEL_PATTERN,
  hasExcludedClassificationRole,
  isNonTaxEvidenceLine,
  sourceRank,
  explicitLabelEvidence,
  markerEvidence,
  positionEvidence,
  aiAxisEvidence,
  reconciliationAxisEvidence,
  arithmeticTreatment,
} from "./interpretTaxEvidence";
function chooseAxis<TValue extends string>(
  evidence: AxisEvidence<TValue>[],
  unknown: TValue,
): AxisEvidence<TValue> {
  const userSelection = evidence.find((entry) => entry.source === "user");
  if (userSelection) return userSelection;
  const known = evidence.filter((entry) => entry.value !== unknown);
  if (known.length === 0) return { value: unknown, source: "ai", evidence: [] };
  return [...known].sort((left, right) => sourceRank(left.source) - sourceRank(right.source))[0]!;
}

function estimateTax(summary: ExtractedTaxSummary): number | undefined {
  if (summary.taxRatePercent !== 8 && summary.taxRatePercent !== 10) return undefined;
  const round = (value: number) => {
    switch (summary.roundingMethod) {
      case "floor":
        return Math.floor(value);
      case "ceil":
        return Math.ceil(value);
      case "round":
      case "unknown":
        return Math.round(value);
    }
  };
  if (summary.taxableAmountBasis === "tax_excluded") {
    return Math.max(0, round((summary.taxableAmountYen * summary.taxRatePercent) / 100));
  }
  if (summary.taxableAmountBasis === "tax_included") {
    return Math.max(
      0,
      round((summary.taxableAmountYen * summary.taxRatePercent) / (100 + summary.taxRatePercent)),
    );
  }
  return undefined;
}

function resolveRoundingMethod(summaries: ExtractedTaxSummary[]): RoundingMethod {
  const methods = new Set(summaries.map((summary) => summary.roundingMethod));
  return methods.size === 1 ? [...methods][0]! : "unknown";
}

function taxAmountDecision(input: ReceiptTaxInput): {
  decision: ReceiptTaxAmountDecision;
  conflictingPrintedLines: boolean;
  dependsOnUnverifiedSummary: boolean;
} {
  const classificationByIndex = new Map(
    (input.receiptLineClassifications ?? []).map((classification) => [
      classification.sourceLineIndex,
      classification,
    ]),
  );
  const printedLines = (input.rawObservationLines ?? []).flatMap((line) => {
    const classification = classificationByIndex.get(line.sourceLineIndex);
    const normalized = line.rawText.normalize("NFKC");
    const classifiedRole = classification?.candidates[0]?.role;
    const isTaxAmount =
      !isNonTaxEvidenceLine(line, classification) &&
      (classifiedRole === undefined || classifiedRole === "tax") &&
      TAX_AMOUNT_LABEL_PATTERN.test(normalized) &&
      !/(?:対象|小計)/.test(normalized);
    return isTaxAmount && line.amountYen !== null
      ? [{ amountYen: line.amountYen, normalized }]
      : [];
  });
  const roundingMethod = resolveRoundingMethod(input.taxSummaries);
  if (printedLines.length > 0) {
    const grandTotals = printedLines.filter((line) =>
      /(?:税額?合計|消費税(?:合計|計))/.test(line.normalized),
    );
    const rateDetails = printedLines.filter(
      (line) =>
        !grandTotals.includes(line) &&
        /(?:^|\D)(?:8|10)\s*%|軽減(?:税率|税)|標準(?:税率|税)/.test(line.normalized),
    );
    const genericDetails = printedLines.filter(
      (line) => !grandTotals.includes(line) && !rateDetails.includes(line),
    );
    const uniqueGrandTotals = [...new Set(grandTotals.map((line) => line.amountYen))];
    const rateDetailTotal = rateDetails.reduce((sum, line) => sum + line.amountYen, 0);
    const printedTaxYen =
      uniqueGrandTotals.length === 1
        ? uniqueGrandTotals[0]!
        : rateDetails.length > 0
          ? rateDetailTotal
          : printedLines.length === 1
            ? printedLines[0]!.amountYen
            : undefined;
    const conflictingPrintedLines =
      uniqueGrandTotals.length > 1 ||
      (uniqueGrandTotals.length === 1 &&
        rateDetails.length > 0 &&
        uniqueGrandTotals[0] !== rateDetailTotal) ||
      (uniqueGrandTotals.length === 1 &&
        genericDetails.some((line) => line.amountYen !== uniqueGrandTotals[0])) ||
      printedTaxYen === undefined;
    return {
      decision: { printedTaxYen, roundingMethod, source: "printed" },
      conflictingPrintedLines,
      dependsOnUnverifiedSummary: false,
    };
  }
  const dependsOnUnverifiedSummary = input.taxSummaries.some(
    (summary) =>
      canonicalTaxSummaryStatus(summary.status) !== "verified" &&
      estimateTax(summary) !== undefined,
  );
  const estimates = input.taxSummaries
    .filter((summary) => canonicalTaxSummaryStatus(summary.status) === "verified")
    .map(estimateTax)
    .filter((value): value is number => value !== undefined);
  return {
    decision:
      estimates.length > 0 && !dependsOnUnverifiedSummary
        ? {
            estimatedTaxYen: estimates.reduce((sum, amount) => sum + amount, 0),
            roundingMethod,
            source: "estimated",
          }
        : { roundingMethod, source: "unknown" },
    conflictingPrintedLines: false,
    dependsOnUnverifiedSummary,
  };
}

function candidate(
  priceTaxTreatment: PriceTaxTreatment,
  taxRateComposition: TaxRateComposition,
  source: ReceiptTaxDecisionSource,
  evidence: string[],
  status: ReceiptTaxDecisionCandidate["resolutionStatus"],
  reasons: string[],
): ReceiptTaxDecisionCandidate {
  return {
    priceTaxTreatment,
    taxRateComposition,
    resolutionStatus: status,
    resolutionSource: source,
    evidence,
    reasons,
  };
}

export function interpretReceiptTaxDecision(input: ReceiptTaxInput): ReceiptTaxDecision {
  const explicit = explicitLabelEvidence(input);
  const marker = markerEvidence(input);
  const ai = aiAxisEvidence(input);
  const reconciliation = reconciliationAxisEvidence(input);
  const arithmetic = arithmeticTreatment(input);
  const position = positionEvidence(input);

  const priceEvidence: AxisEvidence<PriceTaxTreatment>[] = [
    ...(input.userOverride?.priceTaxTreatment !== undefined
      ? [
          {
            value: input.userOverride.priceTaxTreatment,
            source: "user" as const,
            evidence: ["user_override:treatment"],
          },
        ]
      : []),
    ...(explicit.treatment !== "unknown"
      ? [
          {
            value: explicit.treatment,
            source: "explicitLabel" as const,
            evidence: explicit.evidence,
          },
        ]
      : []),
    ...(position?.treatment !== undefined && position.treatment !== "unknown"
      ? [
          {
            value: position.treatment,
            source: "position" as const,
            evidence: position.evidence,
          },
        ]
      : []),
    ...(reconciliation.treatment !== "unknown"
      ? [
          {
            value: reconciliation.treatment,
            source: "reconciliation" as const,
            evidence: reconciliation.evidence,
          },
        ]
      : []),
    ...(ai.treatment !== "unknown"
      ? [{ value: ai.treatment, source: "ai" as const, evidence: ai.evidence }]
      : []),
    ...(arithmetic !== "unknown"
      ? [
          {
            value: arithmetic,
            source: "ai" as const,
            evidence: [`arithmetic:treatment_${arithmetic}`],
          },
        ]
      : []),
  ];
  const rateEvidence: AxisEvidence<TaxRateComposition>[] = [
    ...(input.userOverride?.taxRateComposition !== undefined
      ? [
          {
            value: input.userOverride.taxRateComposition,
            source: "user" as const,
            evidence: ["user_override:composition"],
          },
        ]
      : []),
    ...(explicit.composition !== "unknown"
      ? [
          {
            value: explicit.composition,
            source: "explicitLabel" as const,
            evidence: explicit.evidence,
          },
        ]
      : []),
    ...(marker ? [marker] : []),
    ...(position?.composition !== undefined
      ? [
          {
            value: position.composition,
            source: "position" as const,
            evidence: position.evidence,
          },
        ]
      : []),
    ...(reconciliation.composition !== "unknown"
      ? [
          {
            value: reconciliation.composition,
            source: "reconciliation" as const,
            evidence: reconciliation.evidence,
          },
        ]
      : []),
    ...(ai.composition !== "unknown"
      ? [{ value: ai.composition, source: "ai" as const, evidence: ai.evidence }]
      : []),
  ];

  const selectedPrice = chooseAxis(priceEvidence, "unknown");
  const selectedRate = chooseAxis(rateEvidence, "unknown");
  const source =
    sourceRank(selectedPrice.source) >= sourceRank(selectedRate.source)
      ? selectedPrice.source
      : selectedRate.source;
  const taxAmountResolution = taxAmountDecision(input);
  const taxAmount = taxAmountResolution.decision;
  const selectedPriceConflicts =
    selectedPrice.source !== "user" &&
    priceEvidence.some(
      (entry) =>
        entry.value !== selectedPrice.value &&
        entry.value !== "unknown" &&
        sourceRank(entry.source) <= sourceRank(selectedPrice.source),
    );
  const selectedRateConflicts =
    selectedRate.source !== "user" &&
    rateEvidence.some(
      (entry) =>
        entry.value !== selectedRate.value &&
        entry.value !== "unknown" &&
        sourceRank(entry.source) <= sourceRank(selectedRate.source),
    );
  const summariesContradict =
    input.taxSummaries.some(
      (summary) => canonicalTaxSummaryStatus(summary.status) === "contradictory",
    ) ||
    reconciliation.mismatch ||
    taxAmountResolution.conflictingPrintedLines;
  const strongSources: ReceiptTaxDecisionSource[] = [
    "user",
    "explicitLabel",
    "marker",
    "position",
    "reconciliation",
  ];
  const axesHavePrimaryEvidence =
    strongSources.includes(selectedPrice.source) && strongSources.includes(selectedRate.source);
  const missingAxis = selectedPrice.value === "unknown" || selectedRate.value === "unknown";
  const estimatedWithUnknownRounding =
    taxAmount.source === "estimated" && taxAmount.roundingMethod === "unknown";
  const reasons = [
    ...(summariesContradict ? ["contradictory_tax_summary"] : []),
    ...(reconciliation.mismatch ? ["receipt_reconciliation_mismatch"] : []),
    ...(taxAmountResolution.conflictingPrintedLines ? ["conflicting_printed_tax_lines"] : []),
    ...(selectedPriceConflicts ? ["conflicting_price_evidence"] : []),
    ...(selectedRateConflicts ? ["conflicting_rate_evidence"] : []),
    ...(missingAxis ? ["unresolved_tax_axis"] : []),
    ...(!axesHavePrimaryEvidence ? ["insufficient_primary_evidence"] : []),
    ...(estimatedWithUnknownRounding ? ["estimated_tax_with_unknown_rounding"] : []),
    ...(taxAmountResolution.dependsOnUnverifiedSummary
      ? ["unverified_tax_summary_for_estimate"]
      : []),
    ...(position ? ["tax_line_in_receipt_footer"] : []),
    ...((input.receiptLineClassifications ?? []).some(hasExcludedClassificationRole) ||
    (input.rawObservationLines ?? []).some((line) =>
      isNonTaxEvidenceLine(
        line,
        (input.receiptLineClassifications ?? []).find(
          (classification) => classification.sourceLineIndex === line.sourceLineIndex,
        ),
      ),
    )
      ? ["non_tax_adjustment_lines_excluded"]
      : []),
  ];
  const status = summariesContradict
    ? "contradictory"
    : missingAxis ||
        !axesHavePrimaryEvidence ||
        estimatedWithUnknownRounding ||
        taxAmountResolution.dependsOnUnverifiedSummary ||
        selectedPriceConflicts ||
        selectedRateConflicts
      ? "ambiguous"
      : "verified";

  const candidates = [
    candidate(
      selectedPrice.value,
      selectedRate.value,
      source,
      [...new Set([...selectedPrice.evidence, ...selectedRate.evidence])],
      status,
      reasons,
    ),
    ...priceEvidence
      .filter(
        (entry) => entry.value !== selectedPrice.value || entry.source !== selectedPrice.source,
      )
      .map((entry) =>
        candidate(entry.value, selectedRate.value, entry.source, entry.evidence, "ambiguous", [
          "lower_priority_alternative",
        ]),
      ),
    ...rateEvidence
      .filter((entry) => entry.value !== selectedRate.value || entry.source !== selectedRate.source)
      .map((entry) =>
        candidate(selectedPrice.value, entry.value, entry.source, entry.evidence, "ambiguous", [
          "lower_priority_alternative",
        ]),
      ),
  ];

  return {
    ...candidates[0]!,
    evidence: [...candidates[0]!.evidence, ...(position ? ["position:tax_footer"] : [])],
    candidates,
    taxAmount,
  };
}
