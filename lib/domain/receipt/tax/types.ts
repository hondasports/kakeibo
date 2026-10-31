export const RECEIPT_ITEM_TAX_CONFIRMED_FIELDS = ["amountBasis", "taxRatePercent"] as const;

export type ReceiptItemTaxConfirmedField = (typeof RECEIPT_ITEM_TAX_CONFIRMED_FIELDS)[number];

import type { ReceiptItemLineType } from "../discountItems";
export const TAX_RATE_PERCENTS = [0, 8, 10] as const;

export const RECEIPT_TOTAL_SOURCES = ["explicit_label", "user_confirmed", "ai_estimate"] as const;

export type ReceiptTotalSource = (typeof RECEIPT_TOTAL_SOURCES)[number];

export type TaxRatePercent = (typeof TAX_RATE_PERCENTS)[number];
export const AMOUNT_BASES = ["tax_included", "tax_excluded", "unknown"] as const;

export type AmountBasis = (typeof AMOUNT_BASES)[number];
export type ResolvedAmountBasis = Exclude<AmountBasis, "unknown">;
export const TAX_MODES = ["external", "included", "mixed", "unknown"] as const;

export type TaxMode = (typeof TAX_MODES)[number];
export const ROUNDING_METHODS = ["floor", "round", "ceil", "unknown"] as const;

export type RoundingMethod = (typeof ROUNDING_METHODS)[number];

export const PRICE_TAX_TREATMENTS = ["included", "excluded", "perItem", "unknown"] as const;

export type PriceTaxTreatment = (typeof PRICE_TAX_TREATMENTS)[number];
export const TAX_RATE_COMPOSITIONS = ["rate8", "rate10", "mixed", "unknown"] as const;

export type TaxRateComposition = (typeof TAX_RATE_COMPOSITIONS)[number];
export const RECEIPT_TAX_DECISION_SOURCES = [
  "user",
  "explicitLabel",
  "marker",
  "position",
  "reconciliation",
  "ai",
] as const;

export type ReceiptTaxDecisionSource = (typeof RECEIPT_TAX_DECISION_SOURCES)[number];

export type ReceiptTaxDecisionCandidate = {
  priceTaxTreatment: PriceTaxTreatment;
  taxRateComposition: TaxRateComposition;
  resolutionStatus: TaxSummaryDecisionStatus;
  resolutionSource: ReceiptTaxDecisionSource;
  evidence: string[];
  reasons: string[];
};

export type ReceiptTaxAmountDecision = {
  userConfirmedTaxYen?: number;
  printedTaxYen?: number;
  estimatedTaxYen?: number;
  roundingMethod: RoundingMethod;
  source: ReceiptTaxAmountDecisionSource;
};

export type ReceiptTaxDecision = ReceiptTaxDecisionCandidate & {
  candidates: ReceiptTaxDecisionCandidate[];
  taxAmount: ReceiptTaxAmountDecision;
};

export const RECEIPT_TAX_AMOUNT_DECISION_SOURCES = [
  "printed",
  "estimated",
  "unknown",
  "user",
] as const;

export type ReceiptTaxAmountDecisionSource = (typeof RECEIPT_TAX_AMOUNT_DECISION_SOURCES)[number];
export const TAX_SUMMARY_DECISION_STATUSES = ["verified", "ambiguous", "contradictory"] as const;

export type TaxSummaryDecisionStatus = (typeof TAX_SUMMARY_DECISION_STATUSES)[number];
export const LEGACY_TAX_SUMMARY_CONSISTENCY_STATUSES = [
  "coherent",
  "reconcilable",
  "conflicting",
] as const;

export type LegacyTaxSummaryConsistencyStatus =
  (typeof LEGACY_TAX_SUMMARY_CONSISTENCY_STATUSES)[number];
/** Legacy values remain readable until the observation contract migration in #667. */
export const TAX_SUMMARY_CONSISTENCY_STATUSES = [
  ...TAX_SUMMARY_DECISION_STATUSES,
  ...LEGACY_TAX_SUMMARY_CONSISTENCY_STATUSES,
] as const;

export type TaxSummaryConsistencyStatus = (typeof TAX_SUMMARY_CONSISTENCY_STATUSES)[number];

export const TAX_SUMMARY_CONSISTENCY_REASONS = [
  "included_mode_with_tax_excluded_basis",
  "external_mode_with_tax_included_basis",
  "tax_summary_amount_mismatch",
  "tax_included_amount_mismatch",
  "reconciled_to_included",
  "reconciled_to_external",
  "mixed_tax_mode",
  "unresolved_tax_summary",
] as const;

export type TaxSummaryConsistencyReason = (typeof TAX_SUMMARY_CONSISTENCY_REASONS)[number];

export type TaxSummaryConsistency = {
  status: TaxSummaryDecisionStatus;
  reasons: TaxSummaryConsistencyReason[];
};

export type ReceiptMarkerDefinition = { marker: string; description: string };

export type ExtractedReceiptItem = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  printedAmountYen: number;
  taxRatePercent: TaxRatePercent | null;
  amountBasis: AmountBasis;
  markers: string[];
  /** @deprecated 既存の抽出・保存形式との互換用。 */
  taxMarker?: string;
  categoryName?: string;
  quantity?: number;
  unitPriceYen?: number;
  warnings: string[];
};

export const TAX_SUMMARY_USER_EDITED_FIELDS = [
  "taxRatePercent",
  "taxMode",
  "taxableAmountYen",
  "taxableAmountBasis",
  "taxYen",
  "taxIncludedAmountYen",
] as const;

export type TaxSummaryUserEditedField = (typeof TAX_SUMMARY_USER_EDITED_FIELDS)[number];

export const TAX_SUMMARY_VALUE_ORIGIN_SOURCES = ["items", "user", "unknown"] as const;

export type TaxSummaryValueOriginSource = (typeof TAX_SUMMARY_VALUE_ORIGIN_SOURCES)[number];

export type ExtractedTaxSummary = {
  /** 対象額の出所とは別に、個別フィールドの手修正を保持する。 */
  userEditedFields?: TaxSummaryUserEditedField[];
  /** 未設定の旧データは出所不明として扱う。原文は別に保持する。 */
  valueOrigin?: { source: TaxSummaryValueOriginSource; previousTaxableAmountYen?: number };
  taxRatePercent: TaxRatePercent;
  taxMode: TaxMode;
  taxableAmountYen: number;
  taxableAmountBasis: AmountBasis;
  taxYen: number;
  taxIncludedAmountYen?: number;
  roundingMethod: RoundingMethod;
  confidence: Record<string, number | undefined>;
  warnings: string[];
  status?: TaxSummaryConsistencyStatus;
  reasons?: TaxSummaryConsistencyReason[];
};

export const TAX_RESOLUTION_SOURCES = [
  "item_explicit",
  "single_summary",
  "summary_reconciliation",
  "remaining_summary",
  "marker_reconciled",
  "paid_total_reconciliation",
] as const;

export type TaxResolutionSource = (typeof TAX_RESOLUTION_SOURCES)[number];

export const TAX_RESOLUTION_STATUSES = ["resolved", "unresolved"] as const;

export type TaxResolutionStatus = (typeof TAX_RESOLUTION_STATUSES)[number];

export const TAX_ALLOCATION_STATUSES = ["allocated", "unallocated"] as const;

export type TaxAllocationStatus = (typeof TAX_ALLOCATION_STATUSES)[number];

export type TaxContextResolution =
  | {
      status: "resolved";
      taxRatePercent: TaxRatePercent;
      amountBasis: ResolvedAmountBasis;
      source: TaxResolutionSource;
    }
  | {
      status: "unresolved";
      taxRatePercent: TaxRatePercent | null;
      amountBasis: AmountBasis;
      reasons: string[];
    };

export type InterpretedReceiptItem = ExtractedReceiptItem & {
  taxContext: TaxContextResolution;
  allocatedTaxYen: number;
  taxAllocationStatus?: TaxAllocationStatus;
  normalizedAmountYen: number;
};

export type ReceiptTaxInput = {
  amountYen: number;
  receiptTotalSource?: ReceiptTotalSource;
  receiptTotalConfidence?: number;
  receiptTotalSupportingCandidates?: ReceiptTotalCandidate[];
  items: ExtractedReceiptItem[];
  taxSummaries: ExtractedTaxSummary[];
  markerDefinitions?: ReceiptMarkerDefinition[];
  rawObservationLines?: import("../observations").ReceiptRawObservationLine[];
  receiptLineClassifications?: import("../observations").ReceiptLineClassification[];
  userOverride?: {
    priceTaxTreatment?: PriceTaxTreatment;
    taxRateComposition?: TaxRateComposition;
  };
};

export type ReceiptTaxInterpretation = {
  items: InterpretedReceiptItem[];
  taxSummaries: ExtractedTaxSummary[];
  receiptTotalResolution: ReceiptTotalResolution;
  decision: ReceiptTaxDecision;
  warnings: string[];
};

export const RECEIPT_TOTAL_CANDIDATE_SOURCES = [
  ...RECEIPT_TOTAL_SOURCES,
  "payment_change",
  "tax_summary_total",
  "tax_arithmetic",
] as const;

export type ReceiptTotalCandidateSource = (typeof RECEIPT_TOTAL_CANDIDATE_SOURCES)[number];

export type ReceiptTotalCandidate = {
  amountYen: number;
  source: ReceiptTotalCandidateSource;
  evidence: string;
};

export type ReceiptTotalResolution = {
  status: TaxSummaryDecisionStatus;
  protectedAmountYen: number | null;
  candidates: ReceiptTotalCandidate[];
  reasons: string[];
};

export type TaxEvidence =
  | {
      type: "tax_summary";
      taxRatePercent: TaxRatePercent;
      taxableAmountYen: number;
      amountBasis: AmountBasis;
    }
  | { type: "item_explicit_rate"; itemIndex: number; taxRatePercent: TaxRatePercent }
  | {
      type: "marker_legend";
      itemIndex: number;
      marker: string;
      description: string;
      interpretedTaxRatePercent?: TaxRatePercent;
    };

export type ReconciliationResult = {
  taxSummaries: ExtractedTaxSummary[];
  resolvableTaxSummaries: ExtractedTaxSummary[];
  duplicateWarnings: string[];
  conflictingWarnings: string[];
};
