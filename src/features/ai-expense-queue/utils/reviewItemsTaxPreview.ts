import { reinterpretDraftTax } from "../../../../lib/receiptTax/reinterpretDraftTax";
import type { DraftItemTaxFields } from "../../../../lib/receiptTax/draftTaxMapping";
import type {
  ExtractedTaxSummary,
  PriceTaxTreatment,
  TaxRateComposition,
} from "../../../../lib/receiptTax/types";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";

function toExtractedTaxSummaries(
  taxSummaries: NonNullable<AiExpenseDraft["taxSummaries"]>,
): ExtractedTaxSummary[] {
  return taxSummaries.map((summary) => ({
    ...summary,
    confidence: {},
  }));
}

function reviewItemToDraftFields(item: ReviewItemValues): DraftItemTaxFields {
  const printedAmountYen =
    item.printedAmountYen ??
    (Number.isFinite(Number(item.amountYen)) ? Number(item.amountYen) : undefined);

  return {
    itemName: item.itemName,
    printedAmountYen,
    amountBasis: item.amountBasis,
    taxRatePercent: item.taxRatePercent,
    markers: item.markers,
    taxMarker: item.taxMarker,
    allocatedTaxYen: item.allocatedTaxYen,
    taxAllocationStatus: item.taxAllocationStatus,
    normalizedAmountYen: item.normalizedAmountYen,
    quantity: item.quantity,
    unitPriceYen: item.unitPriceYen,
    warnings: item.warnings,
    taxResolutionStatus: item.taxResolutionStatus,
    taxResolutionSource: item.taxResolutionSource,
    taxReviewReasons: item.taxReviewReasons,
  };
}

export function applyReviewItemsTaxPreview(
  items: ReviewItemValues[],
  args: {
    paidTotalYen?: number;
    taxSummaries?: AiExpenseDraft["taxSummaries"];
    markerDefinitions?: AiExpenseDraft["markerDefinitions"];
    priceTaxTreatment?: PriceTaxTreatment;
    taxRateComposition?: TaxRateComposition;
  },
): ReviewItemValues[] {
  const paidTotalYen = args.paidTotalYen;
  if (paidTotalYen === undefined || !Number.isFinite(paidTotalYen) || paidTotalYen < 1) {
    return items;
  }
  if (
    (!args.taxSummaries || args.taxSummaries.length === 0) &&
    !items.some((item) => item.taxRatePercent != null || item.amountBasis != null) &&
    args.priceTaxTreatment === undefined &&
    args.taxRateComposition === undefined
  ) {
    return items;
  }

  const { itemFields } = reinterpretDraftTax({
    amountYen: paidTotalYen,
    items: items.map(reviewItemToDraftFields),
    taxSummaries: args.taxSummaries ? toExtractedTaxSummaries(args.taxSummaries) : [],
    markerDefinitions: args.markerDefinitions,
    decisionOverride: {
      priceTaxTreatment: args.priceTaxTreatment,
      taxRateComposition: args.taxRateComposition,
    },
  });

  return items.map((item, index) => {
    const fields = itemFields[index];
    if (!fields) {
      return item;
    }
    return {
      ...item,
      printedAmountYen: fields.printedAmountYen,
      amountBasis: fields.amountBasis,
      taxRatePercent: fields.taxRatePercent,
      allocatedTaxYen: fields.allocatedTaxYen,
      taxAllocationStatus: fields.taxAllocationStatus,
      normalizedAmountYen: fields.normalizedAmountYen,
      taxResolutionStatus: fields.taxResolutionStatus,
      taxResolutionSource: fields.taxResolutionSource,
      taxReviewReasons: fields.taxReviewReasons,
      warnings: fields.warnings,
    };
  });
}
