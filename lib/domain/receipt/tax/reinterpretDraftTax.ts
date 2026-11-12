import {
  draftItemToExtractedReceiptItem,
  interpretedItemToDraftFields,
  type DraftItemTaxFields,
} from "./draftTaxMapping";
import { interpretReceiptTax } from "./interpretReceiptTax";
import type {
  AmountBasis,
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxInput,
  ReceiptTotalSource,
  ReceiptTaxInterpretation,
  TaxRatePercent,
} from "./types";
import {
  resolveObservationAmounts,
  type ReceiptLineClassification,
  type ReceiptRawObservationLine,
} from "../observations";
import { ITEM_IDENTITY_CHANGED, getItemTaxConfirmedFields } from "./itemTaxConfirmation";
import { deriveReceiptTaxSummaries } from "./deriveReceiptTaxSummaries";
import { normalizeTaxSummary } from "./taxSummaryConsistency";
import { taxSummaryEvidenceLines } from "./summaryEvidence";

export type DraftTaxOverride = {
  itemIndex: number;
  taxRatePercent?: TaxRatePercent | null;
  amountBasis?: AmountBasis;
};

export type BulkUnresolvedTaxOverride = {
  taxRatePercent: TaxRatePercent;
  amountBasis: AmountBasis;
};

export type ReinterpretDraftTaxInput = {
  amountYen: number;
  receiptTotalSource?: ReceiptTotalSource;
  receiptTotalConfidence?: number;
  receiptTotalSupportingCandidates?: ReceiptTaxInput["receiptTotalSupportingCandidates"];
  items: DraftItemTaxFields[];
  taxSummaries: ExtractedTaxSummary[];
  sourceTaxSummaries?: ExtractedTaxSummary[];
  correctedTaxSummaries?: ExtractedTaxSummary[];
  markerDefinitions?: ReceiptMarkerDefinition[];
  rawObservationLines?: ReceiptRawObservationLine[];
  receiptLineClassifications?: ReceiptLineClassification[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
};

export type ReinterpretDraftTaxResult = {
  interpretation: ReceiptTaxInterpretation;
  itemFields: (ReturnType<typeof interpretedItemToDraftFields> &
    Pick<DraftItemTaxFields, "taxConfirmedFields">)[];
};

function shouldApplyBulkOverride(
  item: DraftItemTaxFields,
  extracted: ReturnType<typeof draftItemToExtractedReceiptItem>,
): boolean {
  if (item.taxResolutionStatus === "resolved") {
    return false;
  }
  if (item.taxResolutionStatus === "unresolved") {
    return true;
  }
  return extracted.amountBasis === "unknown" && extracted.taxRatePercent === null;
}

function hasPrintedSummaryAmounts(
  summary: ExtractedTaxSummary,
  normalizedSources: ExtractedTaxSummary[],
  input: ReinterpretDraftTaxInput,
  lines: ReturnType<typeof resolveObservationAmounts>,
  requireTaxAmount = true,
): boolean {
  const options = {
    singleSummary: normalizedSources.length === 1,
    classifications: input.receiptLineClassifications,
  };
  return (
    taxSummaryEvidenceLines(lines, summary.taxRatePercent, "target", options).some(
      (line) => line.amountYen === summary.taxableAmountYen,
    ) &&
    (!requireTaxAmount ||
      taxSummaryEvidenceLines(lines, summary.taxRatePercent, "tax", options).some(
        (line) => line.amountYen === summary.taxYen,
      ))
  );
}

function resolveReconciledItemBases(
  items: ExtractedReceiptItem[],
  normalizedSources: ExtractedTaxSummary[],
  input: ReinterpretDraftTaxInput,
  rawObservationLines: ReturnType<typeof resolveObservationAmounts>,
): ExtractedReceiptItem[] {
  const candidates = items.map((item, index) => {
    if (
      item.amountBasis !== "unknown" ||
      getItemTaxConfirmedFields(input.items[index]).includes("amountBasis") ||
      (input.override?.itemIndex === index && input.override.amountBasis !== undefined)
    )
      return item;
    const matching = normalizedSources.filter(
      (summary) =>
        summary.taxRatePercent === item.taxRatePercent &&
        summary.status === "verified" &&
        summary.reasons?.some(
          (reason) => reason === "reconciled_to_external" || reason === "reconciled_to_included",
        ),
    );
    if (matching.length !== 1) return item;
    return { ...item, amountBasis: matching[0].taxableAmountBasis };
  });
  if (!candidates.some((item, index) => item.amountBasis !== items[index].amountBasis))
    return items;
  const candidateSummaries = deriveReceiptTaxSummaries({
    amountYen: input.amountYen,
    items: candidates,
    lines: rawObservationLines,
    classifications: input.receiptLineClassifications,
    correctedSummaries: input.correctedTaxSummaries,
  });
  const hasMatchingEvidence = normalizedSources.every((summary) => {
    const derived = candidateSummaries.find(
      (entry) => entry.taxRatePercent === summary.taxRatePercent,
    );
    return (
      derived &&
      derived.warnings.length === 0 &&
      derived.taxableAmountYen === summary.taxableAmountYen &&
      derived.taxYen === summary.taxYen &&
      derived.taxableAmountBasis === summary.taxableAmountBasis &&
      hasPrintedSummaryAmounts(
        summary,
        normalizedSources,
        input,
        rawObservationLines,
        candidates.some(
          (item, index) =>
            item.taxRatePercent === summary.taxRatePercent &&
            item.amountBasis !== items[index].amountBasis,
        ),
      )
    );
  });
  return hasMatchingEvidence && candidateSummaries.length === normalizedSources.length
    ? candidates
    : items;
}

export function reinterpretDraftTax(input: ReinterpretDraftTaxInput): ReinterpretDraftTaxResult {
  const rawObservationLines = resolveObservationAmounts(input.rawObservationLines);
  const needsRateConfirmation = input.items.map(
    (item, index) =>
      Boolean(item.taxReviewReasons?.includes(ITEM_IDENTITY_CHANGED)) &&
      !(input.override?.itemIndex === index && input.override.taxRatePercent != null) &&
      !(
        input.bulkUnresolvedOverride &&
        shouldApplyBulkOverride(item, draftItemToExtractedReceiptItem(item))
      ),
  );
  const adjustedItems = input.items.map((item, index) => {
    const extracted = draftItemToExtractedReceiptItem(item);
    // 前回の判定理由は再計算する。OCR由来の一般的な注意は保持する。
    extracted.warnings = extracted.warnings.filter(
      (warning) => warning !== "unresolved_tax_rate" && warning !== "unresolved_amount_basis",
    );
    if (needsRateConfirmation[index]) {
      return {
        ...extracted,
        amountBasis:
          input.override?.itemIndex === index
            ? (input.override.amountBasis ?? extracted.amountBasis)
            : extracted.amountBasis,
        taxRatePercent: null,
        markers: [],
      };
    }
    if (input.override?.itemIndex === index) {
      return {
        ...extracted,
        taxRatePercent:
          input.override.taxRatePercent !== undefined
            ? input.override.taxRatePercent
            : extracted.taxRatePercent,
        amountBasis: input.override.amountBasis ?? extracted.amountBasis,
      };
    }
    if (
      input.bulkUnresolvedOverride &&
      shouldApplyBulkOverride(item, extracted) &&
      input.override?.itemIndex !== index
    ) {
      return {
        ...extracted,
        taxRatePercent: input.bulkUnresolvedOverride.taxRatePercent,
        amountBasis: input.bulkUnresolvedOverride.amountBasis,
      };
    }
    return extracted;
  });

  const sourceSummaries = input.sourceTaxSummaries ?? [];
  const normalizedSources = sourceSummaries.map((summary) =>
    normalizeTaxSummary(summary, sourceSummaries.length === 1 ? input.amountYen : undefined),
  );
  const items = resolveReconciledItemBases(
    adjustedItems,
    normalizedSources,
    input,
    rawObservationLines,
  );

  const confirmedFields = items.map((item, index) => {
    const original = input.items[index];
    const confirmed = new Set(getItemTaxConfirmedFields(original));
    const override = input.override?.itemIndex === index ? input.override : undefined;
    const bulk =
      input.bulkUnresolvedOverride &&
      shouldApplyBulkOverride(original, draftItemToExtractedReceiptItem(original));
    if (override?.amountBasis !== undefined || bulk) confirmed.add("amountBasis");
    if (override?.taxRatePercent !== undefined || bulk) confirmed.add("taxRatePercent");
    if (item.taxRatePercent === null || needsRateConfirmation[index])
      confirmed.delete("taxRatePercent");
    return (["amountBasis", "taxRatePercent"] as const).filter((field) => confirmed.has(field));
  });
  // 「不明」の選択は自動補完を止めるために記録するが、税額の確定には使わない。
  const itemTaxWasConfirmed = (index: number): boolean =>
    confirmedFields[index].length === 2 && items[index].amountBasis !== "unknown";
  const taxSummaries = deriveReceiptTaxSummaries({
    paidTotalConfirmed: input.receiptTotalSource === "user_confirmed",
    amountYen: input.amountYen,
    items,
    allowEstimates: items.every(
      (item, index) =>
        item.amountBasis !== "unknown" &&
        item.taxRatePercent !== null &&
        itemTaxWasConfirmed(index),
    ),
    correctedSummaries: input.correctedTaxSummaries,
    lines: rawObservationLines,
    classifications: input.receiptLineClassifications,
  });

  const interpretation = interpretReceiptTax({
    amountYen: input.amountYen,
    receiptTotalSource: input.receiptTotalSource,
    receiptTotalConfidence: input.receiptTotalConfidence,
    receiptTotalSupportingCandidates: input.receiptTotalSupportingCandidates,
    items,
    taxSummaries,
    markerDefinitions: input.markerDefinitions,
    rawObservationLines,
    receiptLineClassifications: input.receiptLineClassifications,
  });
  const interpretedItems = interpretation.items;
  const amountsResolved =
    interpretation.taxSummaries.length > 0 &&
    interpretation.taxSummaries.every((summary) => summary.status === "verified") &&
    interpretedItems.every((item) => item.taxAllocationStatus === "allocated") &&
    interpretedItems.reduce((sum, item) => sum + item.normalizedAmountYen, 0) === input.amountYen;
  const effectiveItems = interpretedItems.map((item, index) => {
    if (needsRateConfirmation[index]) {
      const rate =
        input.override?.itemIndex === index && input.override.taxRatePercent !== undefined
          ? input.override.taxRatePercent
          : (input.items[index].taxRatePercent ?? null);
      return {
        ...item,
        taxRatePercent: rate,
        allocatedTaxYen: 0,
        normalizedAmountYen: item.printedAmountYen,
        taxAllocationStatus: "unallocated" as const,
        taxContext: {
          status: "unresolved" as const,
          taxRatePercent: rate,
          amountBasis: item.amountBasis,
          reasons: [ITEM_IDENTITY_CHANGED, "unresolved_tax_rate"],
        },
        warnings: [...new Set([...item.warnings, "unresolved_tax_rate"])],
      };
    }
    return amountsResolved
      ? { ...item, warnings: item.warnings.filter((warning) => warning !== "amount_mismatch") }
      : item;
  });
  const hasTaxReadingCorrection = taxSummaries.some((summary) =>
    summary.userEditedFields?.includes("taxYen"),
  );
  const resolvedInterpretation = {
    ...interpretation,
    taxSummaries: interpretation.taxSummaries.map((summary) => {
      const matching = normalizedSources.filter(
        (entry) => entry.taxRatePercent === summary.taxRatePercent,
      );
      const source = matching.length === 1 ? matching[0] : undefined;
      if (
        summary.status !== "verified" ||
        source?.status !== "verified" ||
        source.taxableAmountYen !== summary.taxableAmountYen ||
        source.taxYen !== summary.taxYen ||
        source.taxableAmountBasis !== summary.taxableAmountBasis ||
        !hasPrintedSummaryAmounts(summary, normalizedSources, input, rawObservationLines)
      )
        return summary;
      return {
        ...summary,
        reasons: [...new Set([...(summary.reasons ?? []), ...(source.reasons ?? [])])],
      };
    }),
    items: effectiveItems,
    decision: hasTaxReadingCorrection
      ? {
          ...interpretation.decision,
          taxAmount: {
            ...interpretation.decision.taxAmount,
            userConfirmedTaxYen: taxSummaries.reduce((sum, summary) => sum + summary.taxYen, 0),
            source: "user" as const,
          },
        }
      : interpretation.decision,
  };

  return {
    interpretation: resolvedInterpretation,
    itemFields: effectiveItems.map((item, index) => {
      const fields = {
        ...interpretedItemToDraftFields(item),
        taxConfirmedFields: confirmedFields[index],
      };
      if (fields.taxAllocationStatus !== "allocated" && !itemTaxWasConfirmed(index)) {
        return {
          ...fields,
          taxResolutionStatus: "unresolved" as const,
          taxResolutionSource: input.items[index].taxResolutionSource,
        };
      }
      return fields;
    }),
  };
}

export function resolveAmountBasisFromSummary(summary: ExtractedTaxSummary): AmountBasis | null {
  if (summary.taxableAmountBasis === "tax_included") {
    return "tax_included";
  }
  if (summary.taxableAmountBasis === "tax_excluded") {
    return "tax_excluded";
  }
  if (summary.taxMode === "external") {
    return "tax_excluded";
  }
  if (summary.taxMode === "included") {
    return "tax_included";
  }
  return null;
}
