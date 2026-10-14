import { collectTaxEvidence } from "./collectTaxEvidence";
import { interpretReceiptTaxDecision } from "./interpretReceiptTaxDecision";
import { normalizeAmounts } from "./normalizeAmounts";
import { normalizeTaxSummaries } from "./normalizeTaxSummaries";
import { reconcileTaxSummaries } from "./reconcileTaxSummaries";
import { resolveTaxContext } from "./resolveTaxContext";
import { resolveReceiptTotal } from "./resolveReceiptTotal";
import type { ExtractedTaxSummary, ReceiptTaxInput, ReceiptTaxInterpretation } from "./types";
import { validateConsistency } from "./validateConsistency";

export function interpretReceiptTax(input: ReceiptTaxInput): ReceiptTaxInterpretation {
  const normalizedInput = {
    ...input,
    items: input.items.map((item) => ({
      ...item,
      markers: item.markers.length > 0 ? item.markers : item.taxMarker ? [item.taxMarker] : [],
    })),
  };
  const reconciliation = reconcileTaxSummaries(normalizedInput);
  const receiptTotalResolution = resolveReceiptTotal({
    amountYen: input.amountYen,
    source: input.receiptTotalSource,
    confidence: input.receiptTotalConfidence,
    supportingCandidates: input.receiptTotalSupportingCandidates,
    taxSummaries: reconciliation.taxSummaries,
  });
  const normalizedAllSummaries = normalizeTaxSummaries({
    amountYen: input.amountYen,
    taxSummaries: reconciliation.taxSummaries,
    resolvableTaxSummaries: reconciliation.resolvableTaxSummaries,
  });
  const normalizedResolvableSummaries = normalizeTaxSummaries({
    amountYen: input.amountYen,
    taxSummaries: reconciliation.resolvableTaxSummaries,
    resolvableTaxSummaries: reconciliation.resolvableTaxSummaries,
  });
  const processableSummaries = normalizedResolvableSummaries.filter(
    (summary): summary is ExtractedTaxSummary & { status: "verified" } =>
      summary.status === "verified",
  );
  const evidence = collectTaxEvidence({
    ...normalizedInput,
    taxSummaries: processableSummaries,
  });
  const contexts = resolveTaxContext({
    amountYen: input.amountYen,
    items: normalizedInput.items,
    taxSummaries: processableSummaries,
    evidence,
  });
  const items = normalizeAmounts({
    amountYen: input.amountYen,
    items: normalizedInput.items,
    contexts,
    taxSummaries: processableSummaries,
  }).map((item) =>
    item.taxRatePercent === 0 &&
    normalizedAllSummaries.some(
      (summary) =>
        summary.taxRatePercent === 0 &&
        summary.status !== "verified" &&
        summary.status !== "coherent",
    )
      ? { ...item, taxAllocationStatus: "unallocated" as const }
      : item,
  );
  const validationWarnings = validateConsistency({
    amountYen: input.amountYen,
    items,
    taxSummaries: processableSummaries,
  });
  const decision = interpretReceiptTaxDecision({
    ...normalizedInput,
    taxSummaries: normalizedAllSummaries,
  });
  return {
    items,
    taxSummaries: normalizedAllSummaries,
    receiptTotalResolution,
    decision,
    warnings: [
      ...new Set([
        ...reconciliation.duplicateWarnings,
        ...reconciliation.conflictingWarnings,
        ...(receiptTotalResolution.status === "ambiguous" ? ["ambiguous_receipt_total"] : []),
        ...validationWarnings,
      ]),
    ],
  };
}
