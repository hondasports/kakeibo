import {
  draftItemToExtractedReceiptItem,
  interpretedItemToDraftFields,
  type DraftItemTaxFields,
} from "./draftTaxMapping";
import { interpretReceiptTax } from "./interpretReceiptTax";
import type {
  AmountBasis,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxInput,
  ReceiptTaxInterpretation,
  PriceTaxTreatment,
  TaxRateComposition,
  TaxRatePercent,
} from "./types";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../observations";
import { ITEM_IDENTITY_CHANGED, getItemTaxConfirmedFields } from "./itemTaxConfirmation";
import { deriveReceiptTaxSummaries } from "./deriveReceiptTaxSummaries";

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
  receiptTotalSource?: "explicit_label" | "user_confirmed" | "ai_estimate";
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
  decisionOverride?: {
    priceTaxTreatment?: PriceTaxTreatment;
    taxRateComposition?: TaxRateComposition;
  };
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

export function reinterpretDraftTax(input: ReinterpretDraftTaxInput): ReinterpretDraftTaxResult {
  const needsRateConfirmation = input.items.map(
    (item, index) =>
      Boolean(item.taxReviewReasons?.includes(ITEM_IDENTITY_CHANGED)) &&
      !(input.override?.itemIndex === index && input.override.taxRatePercent != null) &&
      !(
        input.bulkUnresolvedOverride &&
        shouldApplyBulkOverride(item, draftItemToExtractedReceiptItem(item))
      ),
  );
  const items = input.items.map((item, index) => {
    const extracted = draftItemToExtractedReceiptItem(item);
    // 前回の判定理由は再計算する。OCR由来の一般的な注意は保持する。
    extracted.warnings = extracted.warnings.filter(
      (warning) => warning !== "unresolved_tax_rate" && warning !== "unresolved_amount_basis",
    );
    const decisionAmountBasis =
      input.decisionOverride?.priceTaxTreatment === "included"
        ? "tax_included"
        : input.decisionOverride?.priceTaxTreatment === "excluded"
          ? "tax_excluded"
          : undefined;
    const decisionTaxRate =
      input.decisionOverride?.taxRateComposition === "rate8"
        ? 8
        : input.decisionOverride?.taxRateComposition === "rate10"
          ? 10
          : undefined;
    const decisionAdjusted = {
      ...extracted,
      amountBasis: decisionAmountBasis ?? extracted.amountBasis,
      taxRatePercent: decisionTaxRate ?? extracted.taxRatePercent,
    };
    if (needsRateConfirmation[index]) {
      return {
        ...decisionAdjusted,
        amountBasis:
          input.override?.itemIndex === index
            ? (input.override.amountBasis ?? decisionAdjusted.amountBasis)
            : decisionAdjusted.amountBasis,
        taxRatePercent: null,
        markers: [],
        taxMarker: undefined,
      };
    }
    if (input.override?.itemIndex === index) {
      return {
        ...decisionAdjusted,
        taxRatePercent:
          input.override.taxRatePercent !== undefined
            ? input.override.taxRatePercent
            : decisionAdjusted.taxRatePercent,
        amountBasis: input.override.amountBasis ?? decisionAdjusted.amountBasis,
      };
    }
    if (
      input.bulkUnresolvedOverride &&
      shouldApplyBulkOverride(item, extracted) &&
      input.override?.itemIndex !== index
    ) {
      return {
        ...decisionAdjusted,
        taxRatePercent: input.bulkUnresolvedOverride.taxRatePercent,
        amountBasis: input.bulkUnresolvedOverride.amountBasis,
      };
    }
    return decisionAdjusted;
  });

  const confirmedFields = items.map((item, index) => {
    const original = input.items[index];
    const confirmed = new Set(getItemTaxConfirmedFields(original));
    const override = input.override?.itemIndex === index ? input.override : undefined;
    const bulk =
      input.bulkUnresolvedOverride &&
      shouldApplyBulkOverride(original, draftItemToExtractedReceiptItem(original));
    if (
      override?.amountBasis !== undefined ||
      bulk ||
      input.decisionOverride?.priceTaxTreatment === "included" ||
      input.decisionOverride?.priceTaxTreatment === "excluded"
    )
      confirmed.add("amountBasis");
    if (
      override?.taxRatePercent !== undefined ||
      bulk ||
      input.decisionOverride?.taxRateComposition === "rate8" ||
      input.decisionOverride?.taxRateComposition === "rate10"
    )
      confirmed.add("taxRatePercent");
    if (item.amountBasis === "unknown") confirmed.delete("amountBasis");
    if (item.taxRatePercent === null || needsRateConfirmation[index])
      confirmed.delete("taxRatePercent");
    return (["amountBasis", "taxRatePercent"] as const).filter((field) => confirmed.has(field));
  });
  const itemTaxWasConfirmed = (index: number): boolean => confirmedFields[index].length === 2;
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
    lines: input.rawObservationLines,
    classifications: input.receiptLineClassifications,
  });

  const userItemPriceWasEdited =
    input.override?.amountBasis !== undefined ||
    input.bulkUnresolvedOverride?.amountBasis !== undefined;
  const userPriceWasEdited =
    userItemPriceWasEdited || input.decisionOverride?.priceTaxTreatment !== undefined;
  const userRateWasEdited =
    input.override?.taxRatePercent !== undefined ||
    input.bulkUnresolvedOverride?.taxRatePercent !== undefined ||
    input.decisionOverride?.taxRateComposition !== undefined;
  const treatmentFromItems = (): PriceTaxTreatment => {
    const bases = new Set(items.map((item) => item.amountBasis));
    if (bases.has("unknown")) return "unknown";
    if (bases.has("tax_included") && bases.has("tax_excluded")) return "perItem";
    if (bases.has("tax_included")) return "included";
    if (bases.has("tax_excluded")) return "excluded";
    return "unknown";
  };
  const treatmentFromSummaries = (): PriceTaxTreatment => {
    const bases = new Set(
      taxSummaries.map((summary) => {
        if (summary.taxableAmountBasis !== "unknown") return summary.taxableAmountBasis;
        if (summary.taxMode === "included") return "tax_included" as const;
        if (summary.taxMode === "external") return "tax_excluded" as const;
        return "unknown" as const;
      }),
    );
    if (bases.has("tax_included") && bases.has("tax_excluded")) return "perItem";
    if (bases.has("tax_included")) return "included";
    if (bases.has("tax_excluded")) return "excluded";
    return "unknown";
  };
  const compositionFromItemsAndSummaries = (): TaxRateComposition => {
    if (items.some((item) => item.taxRatePercent === null)) return "unknown";
    const rates = new Set([
      ...items.map((item) => item.taxRatePercent),
      ...taxSummaries.map((summary) => summary.taxRatePercent),
    ]);
    if (rates.has(8) && rates.has(10)) return "mixed";
    if (rates.has(8)) return "rate8";
    if (rates.has(10)) return "rate10";
    return "unknown";
  };

  const interpretation = interpretReceiptTax({
    amountYen: input.amountYen,
    receiptTotalSource: input.receiptTotalSource,
    receiptTotalConfidence: input.receiptTotalConfidence,
    receiptTotalSupportingCandidates: input.receiptTotalSupportingCandidates,
    items,
    taxSummaries,
    markerDefinitions: input.markerDefinitions,
    rawObservationLines: input.rawObservationLines,
    receiptLineClassifications: input.receiptLineClassifications,
    userOverride:
      userPriceWasEdited || userRateWasEdited
        ? {
            priceTaxTreatment: userPriceWasEdited
              ? (input.decisionOverride?.priceTaxTreatment ??
                (userItemPriceWasEdited ? treatmentFromItems() : treatmentFromSummaries()))
              : undefined,
            taxRateComposition: userRateWasEdited
              ? (input.decisionOverride?.taxRateComposition ?? compositionFromItemsAndSummaries())
              : undefined,
          }
        : undefined,
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
