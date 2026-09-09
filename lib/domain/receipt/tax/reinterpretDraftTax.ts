import {
  draftItemToExtractedReceiptItem,
  interpretedItemToDraftFields,
  type DraftItemTaxFields,
} from "./draftTaxMapping";
import { interpretReceiptTax } from "./interpretReceiptTax";
import type {
  AmountBasis,
  DraftSummaryOverride,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxInput,
  ReceiptTaxInterpretation,
  PriceTaxTreatment,
  TaxRateComposition,
  TaxRatePercent,
} from "./types";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../observations";
import { allocateTax } from "./normalizeAmounts";

export type { DraftSummaryOverride } from "./types";

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
  markerDefinitions?: ReceiptMarkerDefinition[];
  rawObservationLines?: ReceiptRawObservationLine[];
  receiptLineClassifications?: ReceiptLineClassification[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
  summaryOverride?: DraftSummaryOverride;
  decisionOverride?: {
    priceTaxTreatment?: PriceTaxTreatment;
    taxRateComposition?: TaxRateComposition;
  };
};

export type ReinterpretDraftTaxResult = {
  interpretation: ReceiptTaxInterpretation;
  itemFields: ReturnType<typeof interpretedItemToDraftFields>[];
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
  const sourceTaxSummaries = input.taxSummaries.map((summary, index) => {
    if (input.summaryOverride?.index === index) {
      return { ...summary, ...input.summaryOverride.summary };
    }
    return summary;
  });

  const items = input.items.map((item, index) => {
    const extracted = draftItemToExtractedReceiptItem(item);
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

  const selectedRate: TaxRatePercent | undefined =
    input.decisionOverride?.taxRateComposition === "rate8"
      ? 8
      : input.decisionOverride?.taxRateComposition === "rate10"
        ? 10
        : undefined;
  const selectedBasis: AmountBasis | undefined =
    input.decisionOverride?.priceTaxTreatment === "included"
      ? "tax_included"
      : input.decisionOverride?.priceTaxTreatment === "excluded"
        ? "tax_excluded"
        : undefined;
  const taxSummaries =
    selectedRate !== undefined && selectedBasis !== undefined
      ? (() => {
          const printedTotalYen = items.reduce((sum, item) => sum + item.printedAmountYen, 0);
          const taxYen = Math.round(
            selectedBasis === "tax_excluded"
              ? (printedTotalYen * selectedRate) / 100
              : (printedTotalYen * selectedRate) / (100 + selectedRate),
          );
          return [
            {
              taxRatePercent: selectedRate,
              taxMode:
                selectedBasis === "tax_excluded" ? ("external" as const) : ("included" as const),
              taxableAmountYen: printedTotalYen,
              taxableAmountBasis: selectedBasis,
              taxYen,
              taxIncludedAmountYen:
                selectedBasis === "tax_excluded" ? printedTotalYen + taxYen : printedTotalYen,
              roundingMethod: "round" as const,
              confidence: {},
              warnings: [],
              status: "verified" as const,
              reasons: [],
            },
          ];
        })()
      : sourceTaxSummaries;

  const userItemPriceWasEdited =
    input.override?.amountBasis !== undefined ||
    input.bulkUnresolvedOverride?.amountBasis !== undefined;
  const userSummaryPriceWasEdited =
    input.summaryOverride?.summary.taxableAmountBasis !== undefined ||
    input.summaryOverride?.summary.taxMode !== undefined;
  const userPriceWasEdited =
    userItemPriceWasEdited ||
    userSummaryPriceWasEdited ||
    input.decisionOverride?.priceTaxTreatment !== undefined;
  const userRateWasEdited =
    input.override?.taxRatePercent !== undefined ||
    input.bulkUnresolvedOverride?.taxRatePercent !== undefined ||
    input.summaryOverride?.summary.taxRatePercent !== undefined ||
    input.decisionOverride?.taxRateComposition !== undefined;
  const treatmentFromItems = (): PriceTaxTreatment => {
    const bases = new Set(items.map((item) => item.amountBasis));
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
  const interpretedItems =
    selectedRate !== undefined && selectedBasis !== undefined
      ? (() => {
          const summaryTaxYen = taxSummaries[0]?.taxYen ?? 0;
          const printedTotalYen = interpretation.items.reduce(
            (sum, item) => sum + item.printedAmountYen,
            0,
          );
          const allocations = allocateTax(
            summaryTaxYen,
            printedTotalYen,
            interpretation.items.map((item) => item.printedAmountYen),
          );
          return interpretation.items.map((item, index) => {
            const allocatedTaxYen = allocations[index] ?? 0;
            return {
              ...item,
              amountBasis: selectedBasis,
              taxRatePercent: selectedRate,
              allocatedTaxYen,
              taxAllocationStatus: "allocated" as const,
              normalizedAmountYen:
                selectedBasis === "tax_excluded"
                  ? item.printedAmountYen + allocatedTaxYen
                  : item.printedAmountYen,
              taxContext: {
                status: "resolved" as const,
                taxRatePercent: selectedRate,
                amountBasis: selectedBasis,
                source: "item_explicit" as const,
              },
            };
          });
        })()
      : interpretation.items;
  const resolvedInterpretation = { ...interpretation, items: interpretedItems };

  return {
    interpretation: resolvedInterpretation,
    itemFields: interpretedItems.map(interpretedItemToDraftFields),
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
