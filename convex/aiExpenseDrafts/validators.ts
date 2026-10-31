import { v } from "convex/values";
import {
  AI_EXPENSE_DRAFT_STATUSES,
  AI_EXPENSE_DRAFT_SOURCE_TYPES,
  AI_EXPENSE_DRAFT_DOCUMENT_TYPES,
  AI_EXPENSE_DRAFT_REVIEW_REASONS,
} from "../../lib/domain/aiExpenseDrafts/constants";
import {
  AMOUNT_BASES,
  TAX_RATE_PERCENTS,
  TAX_MODES,
  ROUNDING_METHODS,
} from "../../lib/domain/receipt/tax/types";
import { RECEIPT_ITEM_LINE_TYPES } from "../../lib/domain/receipt/discountItems";
import {
  RECEIPT_LINE_ROLES,
  RECEIPT_STRUCTURAL_LINE_ROLES,
} from "../../lib/domain/receipt/observations";
export const roundingMethodValidator = v.union(
  ...ROUNDING_METHODS.map((method) => v.literal(method)),
);
export const receiptItemLineTypeValidator = v.union(
  ...RECEIPT_ITEM_LINE_TYPES.map((lineType) => v.literal(lineType)),
);

export {
  AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD,
  AI_EXPENSE_DRAFT_DOCUMENT_TYPES,
  AI_EXPENSE_DRAFT_REVIEW_REASONS,
  AI_EXPENSE_DRAFT_SOURCE_TYPES,
  AI_EXPENSE_DRAFT_STATUSES,
  type AiExpenseDraftConfidence,
  type AiExpenseDraftDocumentType,
  type AiExpenseDraftReviewReason,
  type AiExpenseDraftSourceType,
  type AiExpenseDraftStatus,
} from "../../lib/domain/aiExpenseDrafts/constants";

export const aiExpenseDraftStatusValidator = v.union(
  ...AI_EXPENSE_DRAFT_STATUSES.map((value) => v.literal(value)),
);

export const aiExpenseDraftSourceTypeValidator = v.union(
  ...AI_EXPENSE_DRAFT_SOURCE_TYPES.map((value) => v.literal(value)),
);

export const aiExpenseDraftDocumentTypeValidator = v.union(
  ...AI_EXPENSE_DRAFT_DOCUMENT_TYPES.map((value) => v.literal(value)),
);

export const aiExpenseDraftReviewReasonValidator = v.union(
  ...AI_EXPENSE_DRAFT_REVIEW_REASONS.map((value) => v.literal(value)),
);

export const amountBasisValidator = v.union(...AMOUNT_BASES.map((value) => v.literal(value)));
export const taxSummaryTaxRatePercentValidator = v.union(
  ...TAX_RATE_PERCENTS.map((value) => v.literal(value)),
);
export const taxModeValidator = v.union(...TAX_MODES.map((value) => v.literal(value)));
export const receiptItemTaxRatePercentValidator = v.union(
  ...TAX_RATE_PERCENTS.map((rate) => v.literal(rate)),
  v.null(),
);
export const receiptMarkersValidator = v.array(v.string());
export const taxResolutionStatusValidator = v.union(v.literal("resolved"), v.literal("unresolved"));
export const taxConfirmedFieldsValidator = v.array(
  v.union(v.literal("amountBasis"), v.literal("taxRatePercent")),
);

export const taxResolutionSourceValidator = v.union(
  v.literal("item_explicit"),
  v.literal("single_summary"),
  v.literal("summary_reconciliation"),
  v.literal("remaining_summary"),
  v.literal("marker_reconciled"),
  v.literal("paid_total_reconciliation"),
);
export const receiptMarkerDefinitionValidator = v.object({
  marker: v.string(),
  description: v.string(),
});
export const markerDefinitionsValidator = v.array(receiptMarkerDefinitionValidator);
export const taxSummaryValidator = v.object({
  userEditedFields: v.optional(
    v.array(
      v.union(
        v.literal("taxRatePercent"),
        v.literal("taxMode"),
        v.literal("taxableAmountYen"),
        v.literal("taxableAmountBasis"),
        v.literal("taxYen"),
        v.literal("taxIncludedAmountYen"),
      ),
    ),
  ),
  valueOrigin: v.optional(
    v.object({
      source: v.union(v.literal("items"), v.literal("user"), v.literal("unknown")),
      previousTaxableAmountYen: v.optional(v.number()),
    }),
  ),
  taxRatePercent: taxSummaryTaxRatePercentValidator,
  taxMode: taxModeValidator,
  taxableAmountYen: v.number(),
  taxableAmountBasis: amountBasisValidator,
  taxYen: v.number(),
  taxIncludedAmountYen: v.optional(v.number()),
  roundingMethod: roundingMethodValidator,
  confidence: v.object({
    taxRatePercent: v.optional(v.number()),
    taxMode: v.optional(v.number()),
    taxableAmountYen: v.optional(v.number()),
    taxableAmountBasis: v.optional(v.number()),
    taxYen: v.optional(v.number()),
  }),
  warnings: v.array(v.string()),
  status: v.optional(
    v.union(
      v.literal("verified"),
      v.literal("ambiguous"),
      v.literal("contradictory"),
      v.literal("coherent"),
      v.literal("reconcilable"),
      v.literal("conflicting"),
    ),
  ),
  reasons: v.optional(
    v.array(
      v.union(
        v.literal("included_mode_with_tax_excluded_basis"),
        v.literal("external_mode_with_tax_included_basis"),
        v.literal("tax_summary_amount_mismatch"),
        v.literal("tax_included_amount_mismatch"),
        v.literal("reconciled_to_included"),
        v.literal("reconciled_to_external"),
        v.literal("mixed_tax_mode"),
        v.literal("unresolved_tax_summary"),
      ),
    ),
  ),
});

export const receiptTotalCandidateSourceValidator = v.union(
  v.literal("explicit_label"),
  v.literal("user_confirmed"),
  v.literal("ai_estimate"),
  v.literal("payment_change"),
  v.literal("tax_summary_total"),
  v.literal("tax_arithmetic"),
);
export const receiptTotalResolutionValidator = v.object({
  status: v.union(v.literal("verified"), v.literal("ambiguous"), v.literal("contradictory")),
  protectedAmountYen: v.union(v.number(), v.null()),
  candidates: v.array(
    v.object({
      amountYen: v.number(),
      source: receiptTotalCandidateSourceValidator,
      evidence: v.string(),
    }),
  ),
  reasons: v.array(v.string()),
});

export const priceTaxTreatmentValidator = v.union(
  v.literal("included"),
  v.literal("excluded"),
  v.literal("perItem"),
  v.literal("unknown"),
);
export const taxRateCompositionValidator = v.union(
  v.literal("rate8"),
  v.literal("rate10"),
  v.literal("mixed"),
  v.literal("unknown"),
);
export const receiptTaxDecisionSourceValidator = v.union(
  v.literal("user"),
  v.literal("explicitLabel"),
  v.literal("marker"),
  v.literal("position"),
  v.literal("reconciliation"),
  v.literal("ai"),
);
const receiptTaxDecisionCandidateValidator = v.object({
  priceTaxTreatment: priceTaxTreatmentValidator,
  taxRateComposition: taxRateCompositionValidator,
  resolutionStatus: v.union(
    v.literal("verified"),
    v.literal("ambiguous"),
    v.literal("contradictory"),
  ),
  resolutionSource: receiptTaxDecisionSourceValidator,
  evidence: v.array(v.string()),
  reasons: v.array(v.string()),
});
export const receiptTaxDecisionValidator = v.object({
  priceTaxTreatment: priceTaxTreatmentValidator,
  taxRateComposition: taxRateCompositionValidator,
  resolutionStatus: v.union(
    v.literal("verified"),
    v.literal("ambiguous"),
    v.literal("contradictory"),
  ),
  resolutionSource: receiptTaxDecisionSourceValidator,
  evidence: v.array(v.string()),
  reasons: v.array(v.string()),
  candidates: v.array(receiptTaxDecisionCandidateValidator),
  taxAmount: v.object({
    userConfirmedTaxYen: v.optional(v.number()),
    printedTaxYen: v.optional(v.number()),
    estimatedTaxYen: v.optional(v.number()),
    roundingMethod: roundingMethodValidator,
    source: v.union(
      v.literal("printed"),
      v.literal("estimated"),
      v.literal("unknown"),
      v.literal("user"),
    ),
  }),
});

export const aiExpenseDraftConfidenceValidator = v.object({
  documentType: v.optional(v.number()),
  shopName: v.optional(v.number()),
  paymentPlace: v.optional(v.number()),
  payeeName: v.optional(v.number()),
  paymentPurpose: v.optional(v.number()),
  date: v.optional(v.number()),
  amountYen: v.optional(v.number()),
  categoryId: v.optional(v.number()),
});

export const aiExpenseDraftItemConfidenceValidator = v.object({
  itemName: v.optional(v.number()),
  amountYen: v.optional(v.number()),
  printedAmountYen: v.optional(v.number()),
  amountBasis: v.optional(v.number()),
  taxRatePercent: v.optional(v.number()),
  categoryName: v.optional(v.number()),
  categoryId: v.optional(v.number()),
});

export const receiptLineRoleValidator = v.union(
  ...RECEIPT_LINE_ROLES.map((value) => v.literal(value)),
);

export const receiptObservationBoundingBoxValidator = v.object({
  left: v.number(),
  top: v.number(),
  width: v.number(),
  height: v.number(),
});

export const receiptRawObservationLineValidator = v.object({
  rawText: v.string(),
  amountText: v.union(v.string(), v.null()),
  amountYen: v.union(v.number(), v.null()),
  lineRoleCandidates: v.array(receiptLineRoleValidator),
  roleConfidence: v.number(),
  explicitlyPrinted: v.boolean(),
  sourceLineIndex: v.number(),
  boundingBox: v.optional(receiptObservationBoundingBoxValidator),
});

export const receiptRawObservationValidator = v.object({
  source: v.union(v.literal("ai_ocr"), v.literal("legacy_projection")),
  observedAt: v.number(),
  lines: v.array(receiptRawObservationLineValidator),
});

export const receiptStructuralLineRoleValidator = v.union(
  ...RECEIPT_STRUCTURAL_LINE_ROLES.map((value) => v.literal(value)),
);

export const receiptLineClassificationValidator = v.object({
  sourceLineIndex: v.number(),
  status: v.union(v.literal("classified"), v.literal("ambiguous")),
  candidates: v.array(
    v.object({
      role: receiptStructuralLineRoleValidator,
      score: v.number(),
      evidence: v.array(v.string()),
    }),
  ),
});

export const receiptDraftItemFields = {
  itemName: v.string(),
  lineType: v.optional(receiptItemLineTypeValidator),
  amountYen: v.number(),
  printedAmountYen: v.optional(v.number()),
  amountBasis: v.optional(amountBasisValidator),
  taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
  markers: v.optional(receiptMarkersValidator),
  taxMarker: v.optional(v.string()),
  allocatedTaxYen: v.optional(v.number()),
  taxAllocationStatus: v.optional(v.union(v.literal("allocated"), v.literal("unallocated"))),
  normalizedAmountYen: v.optional(v.number()),
  taxResolutionStatus: v.optional(taxResolutionStatusValidator),
  taxResolutionSource: v.optional(taxResolutionSourceValidator),
  taxReviewReasons: v.optional(v.array(v.string())),
  quantity: v.optional(v.number()),
  unitPriceYen: v.optional(v.number()),
  categoryName: v.optional(v.string()),
  categoryId: v.optional(v.id("categories")),
  confidence: aiExpenseDraftItemConfidenceValidator,
  warnings: v.optional(v.array(v.string())),
};

export const receiptDraftItemSnapshotValidator = v.object({
  ...receiptDraftItemFields,
  taxConfirmedFields: v.optional(taxConfirmedFieldsValidator),
});

export const receiptDraftValueSnapshotValidator = v.object({
  status: aiExpenseDraftStatusValidator,
  documentType: aiExpenseDraftDocumentTypeValidator,
  shopName: v.optional(v.string()),
  paymentPlace: v.optional(v.string()),
  payeeName: v.optional(v.string()),
  paymentPurpose: v.optional(v.string()),
  date: v.optional(v.string()),
  amountYen: v.optional(v.number()),
  registrationMode: v.optional(v.union(v.literal("detailed"), v.literal("totalOnly"))),
  taxSummaries: v.optional(v.array(taxSummaryValidator)),
  receiptTotalResolution: v.optional(receiptTotalResolutionValidator),
  receiptTaxDecision: v.optional(receiptTaxDecisionValidator),
  receiptLineClassifications: v.optional(v.array(receiptLineClassificationValidator)),
  markerDefinitions: v.optional(markerDefinitionsValidator),
  categoryId: v.optional(v.id("categories")),
  confidence: aiExpenseDraftConfidenceValidator,
  warnings: v.array(v.string()),
  reviewReasons: v.array(aiExpenseDraftReviewReasonValidator),
  items: v.array(receiptDraftItemSnapshotValidator),
});

export const receiptInterpretationSnapshotValidator = v.object({
  source: v.union(v.literal("ai"), v.literal("legacy_projection")),
  interpretedAt: v.number(),
  values: receiptDraftValueSnapshotValidator,
});

export const receiptUserOverrideSnapshotValidator = v.object({
  taxSummaryCorrections: v.optional(v.array(taxSummaryValidator)),
  source: v.literal("user"),
  updatedAt: v.number(),
  fields: v.array(v.string()),
  values: receiptDraftValueSnapshotValidator,
});

export const derivedRegistrationSnapshotValidator = v.object({
  source: v.literal("derived"),
  destination: v.union(v.literal("receipt"), v.literal("expense_entries")),
  registrationMode: v.optional(v.union(v.literal("detailed"), v.literal("totalOnly"))),
  taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
  taxableAmountYen: v.optional(v.union(v.number(), v.null())),
  taxYen: v.optional(v.union(v.number(), v.null())),
  amountYen: v.number(),
  date: v.string(),
  categoryIds: v.array(v.id("categories")),
  registeredAt: v.number(),
});

export const aiExpenseRegistrationModeValidator = v.union(
  v.literal("detailed"),
  v.literal("totalOnly"),
);
