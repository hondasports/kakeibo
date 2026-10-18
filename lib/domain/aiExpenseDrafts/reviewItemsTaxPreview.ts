import {
  resolveReceiptTotalSource,
  resolveReceiptTotalSupportingCandidates,
} from "./receiptTotalEvidence";
import { hasReceiptTaxMetadata } from "../receipt/tax/draftTaxMapping";
import { resolveReceiptTaxCorrections } from "./receiptDataContract";
import type { ReceiptLineClassification } from "../receipt/observations";
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";
import type { DraftItemTaxFields } from "../receipt/tax/draftTaxMapping";
import type {
  ExtractedTaxSummary,
  PriceTaxTreatment,
  TaxRateComposition,
} from "../receipt/tax/types";
import type { AiExpenseDraft, ReviewItemValues } from "./reviewTypes";

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
    lineType: item.lineType,
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
    taxConfirmedFields: item.taxConfirmedFields,
  };
}

type ReviewTaxPreviewArgs = {
  receiptLineClassifications?: ReceiptLineClassification[];
  rawObservation?: AiExpenseDraft["rawObservation"];
  receiptUserOverride?: AiExpenseDraft["receiptUserOverride"];
  paidTotalYen?: number;
  receiptTotalResolution?: AiExpenseDraft["receiptTotalResolution"];
  taxSummaries?: AiExpenseDraft["taxSummaries"];
  sourceTaxSummaries?: AiExpenseDraft["taxSummaries"];
  markerDefinitions?: AiExpenseDraft["markerDefinitions"];
  priceTaxTreatment?: PriceTaxTreatment;
  taxRateComposition?: TaxRateComposition;
};

export function buildReviewTaxPreview(
  items: ReviewItemValues[],
  args: ReviewTaxPreviewArgs,
): {
  items: ReviewItemValues[];
  taxSummaries: NonNullable<AiExpenseDraft["taxSummaries"]>;
} {
  const unchanged = {
    items,
    taxSummaries: args.taxSummaries ?? [],
  };
  const paidTotalYen = args.paidTotalYen;
  if (paidTotalYen === undefined || !Number.isFinite(paidTotalYen) || paidTotalYen < 1) {
    return unchanged;
  }
  if (
    !hasReceiptTaxMetadata(args, items) &&
    args.priceTaxTreatment === undefined &&
    args.taxRateComposition === undefined
  ) {
    return unchanged;
  }

  const sourceSummaries = toExtractedTaxSummaries(args.taxSummaries ?? []);
  const { itemFields, interpretation } = reinterpretDraftTax({
    amountYen: paidTotalYen,
    receiptTotalSource: resolveReceiptTotalSource({
      amountYen: paidTotalYen,
      receiptTotalResolution: args.receiptTotalResolution,
    }),
    receiptTotalSupportingCandidates: resolveReceiptTotalSupportingCandidates(args),
    correctedTaxSummaries: resolveReceiptTaxCorrections(
      args.receiptUserOverride,
      args.sourceTaxSummaries ? toExtractedTaxSummaries(args.sourceTaxSummaries) : undefined,
    ),
    items: items.map(reviewItemToDraftFields),
    taxSummaries: sourceSummaries,
    sourceTaxSummaries: args.sourceTaxSummaries
      ? toExtractedTaxSummaries(args.sourceTaxSummaries)
      : undefined,
    markerDefinitions: args.markerDefinitions,
    receiptLineClassifications: args.receiptLineClassifications,
    rawObservationLines:
      args.rawObservation?.source === "ai_ocr" ? args.rawObservation.lines : undefined,
    decisionOverride: {
      priceTaxTreatment: args.priceTaxTreatment,
      taxRateComposition: args.taxRateComposition,
    },
  });

  const previewItems = items.map((item, index) => {
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
      taxConfirmedFields: fields.taxConfirmedFields,
      warnings: fields.warnings,
    };
  });

  const taxSummaries = interpretation.taxSummaries;
  return { items: previewItems, taxSummaries };
}

export function applyReviewItemsTaxPreview(
  items: ReviewItemValues[],
  args: ReviewTaxPreviewArgs,
): ReviewItemValues[] {
  return buildReviewTaxPreview(items, args).items;
}
