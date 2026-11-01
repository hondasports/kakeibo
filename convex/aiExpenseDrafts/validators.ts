import { v } from "convex/values";
import {
  AI_EXPENSE_DRAFT_STATUSES,
  AI_EXPENSE_DRAFT_SOURCE_TYPES,
  AI_EXPENSE_DRAFT_DOCUMENT_TYPES,
  AI_EXPENSE_DRAFT_REVIEW_REASONS,
} from "../../lib/domain/aiExpenseDrafts/constants";
import {
  AI_EXPENSE_REGISTRATION_MODES,
  RECEIPT_INTERPRETATION_SOURCES,
  REGISTRATION_DESTINATIONS,
} from "../../lib/domain/aiExpenseDrafts/receiptDataContract";
import {
  AMOUNT_BASES,
  TAX_RATE_PERCENTS,
  TAX_MODES,
  ROUNDING_METHODS,
  PRICE_TAX_TREATMENTS,
  TAX_RATE_COMPOSITIONS,
  RECEIPT_TAX_DECISION_SOURCES,
  RECEIPT_TAX_AMOUNT_DECISION_SOURCES,
  RECEIPT_ITEM_TAX_CONFIRMED_FIELDS,
  RECEIPT_TOTAL_CANDIDATE_SOURCES,
  TAX_ALLOCATION_STATUSES,
  TAX_RESOLUTION_SOURCES,
  TAX_RESOLUTION_STATUSES,
  TAX_SUMMARY_CONSISTENCY_REASONS,
  TAX_SUMMARY_CONSISTENCY_STATUSES,
  TAX_SUMMARY_DECISION_STATUSES,
  TAX_SUMMARY_USER_EDITED_FIELDS,
  TAX_SUMMARY_VALUE_ORIGIN_SOURCES,
} from "../../lib/domain/receipt/tax/types";
import { RECEIPT_ITEM_LINE_TYPES } from "../../lib/domain/receipt/discountItems";
import {
  RECEIPT_LINE_CLASSIFICATION_STATUSES,
  RECEIPT_LINE_ROLES,
  RECEIPT_RAW_OBSERVATION_SOURCES,
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

export const aiExpenseRegistrationModeValidator = v.union(
  ...AI_EXPENSE_REGISTRATION_MODES.map((value) => v.literal(value)),
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
export const taxResolutionStatusValidator = v.union(
  ...TAX_RESOLUTION_STATUSES.map((value) => v.literal(value)),
);
export const taxAllocationStatusValidator = v.union(
  ...TAX_ALLOCATION_STATUSES.map((value) => v.literal(value)),
);
export const taxSummaryDecisionStatusValidator = v.union(
  ...TAX_SUMMARY_DECISION_STATUSES.map((value) => v.literal(value)),
);
export const taxConfirmedFieldsValidator = v.array(
  v.union(...RECEIPT_ITEM_TAX_CONFIRMED_FIELDS.map((value) => v.literal(value))),
);

export const taxResolutionSourceValidator = v.union(
  ...TAX_RESOLUTION_SOURCES.map((value) => v.literal(value)),
);
export const receiptMarkerDefinitionValidator = v.object({
  marker: v.string(),
  description: v.string(),
});
export const markerDefinitionsValidator = v.array(receiptMarkerDefinitionValidator);
export const taxSummaryValidator = v.object({
  userEditedFields: v.optional(
    v.array(v.union(...TAX_SUMMARY_USER_EDITED_FIELDS.map((value) => v.literal(value)))),
  ),
  valueOrigin: v.optional(
    v.object({
      source: v.union(...TAX_SUMMARY_VALUE_ORIGIN_SOURCES.map((value) => v.literal(value))),
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
  status: v.optional(v.union(...TAX_SUMMARY_CONSISTENCY_STATUSES.map((value) => v.literal(value)))),
  reasons: v.optional(
    v.array(v.union(...TAX_SUMMARY_CONSISTENCY_REASONS.map((value) => v.literal(value)))),
  ),
});

export const receiptTotalCandidateSourceValidator = v.union(
  ...RECEIPT_TOTAL_CANDIDATE_SOURCES.map((value) => v.literal(value)),
);
export const receiptTotalResolutionValidator = v.object({
  status: taxSummaryDecisionStatusValidator,
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
  ...PRICE_TAX_TREATMENTS.map((value) => v.literal(value)),
);
export const taxRateCompositionValidator = v.union(
  ...TAX_RATE_COMPOSITIONS.map((value) => v.literal(value)),
);
export const receiptTaxDecisionSourceValidator = v.union(
  ...RECEIPT_TAX_DECISION_SOURCES.map((value) => v.literal(value)),
);
const receiptTaxDecisionCandidateValidator = v.object({
  priceTaxTreatment: priceTaxTreatmentValidator,
  taxRateComposition: taxRateCompositionValidator,
  resolutionStatus: taxSummaryDecisionStatusValidator,
  resolutionSource: receiptTaxDecisionSourceValidator,
  evidence: v.array(v.string()),
  reasons: v.array(v.string()),
});
export const receiptTaxDecisionValidator = v.object({
  priceTaxTreatment: priceTaxTreatmentValidator,
  taxRateComposition: taxRateCompositionValidator,
  resolutionStatus: taxSummaryDecisionStatusValidator,
  resolutionSource: receiptTaxDecisionSourceValidator,
  evidence: v.array(v.string()),
  reasons: v.array(v.string()),
  candidates: v.array(receiptTaxDecisionCandidateValidator),
  taxAmount: v.object({
    userConfirmedTaxYen: v.optional(v.number()),
    printedTaxYen: v.optional(v.number()),
    estimatedTaxYen: v.optional(v.number()),
    roundingMethod: roundingMethodValidator,
    source: v.union(...RECEIPT_TAX_AMOUNT_DECISION_SOURCES.map((value) => v.literal(value))),
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
  source: v.union(...RECEIPT_RAW_OBSERVATION_SOURCES.map((value) => v.literal(value))),
  observedAt: v.number(),
  lines: v.array(receiptRawObservationLineValidator),
});

export const receiptStructuralLineRoleValidator = v.union(
  ...RECEIPT_STRUCTURAL_LINE_ROLES.map((value) => v.literal(value)),
);

export const receiptLineClassificationValidator = v.object({
  sourceLineIndex: v.number(),
  status: v.union(...RECEIPT_LINE_CLASSIFICATION_STATUSES.map((value) => v.literal(value))),
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
  taxAllocationStatus: v.optional(taxAllocationStatusValidator),
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
  registrationMode: v.optional(aiExpenseRegistrationModeValidator),
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
  source: v.union(...RECEIPT_INTERPRETATION_SOURCES.map((value) => v.literal(value))),
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
  destination: v.union(...REGISTRATION_DESTINATIONS.map((value) => v.literal(value))),
  registrationMode: v.optional(aiExpenseRegistrationModeValidator),
  taxRatePercent: v.optional(receiptItemTaxRatePercentValidator),
  taxableAmountYen: v.optional(v.union(v.number(), v.null())),
  taxYen: v.optional(v.union(v.number(), v.null())),
  amountYen: v.number(),
  date: v.string(),
  categoryIds: v.array(v.id("categories")),
  registeredAt: v.number(),
});
