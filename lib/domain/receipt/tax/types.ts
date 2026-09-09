export type TaxRatePercent = 0 | 8 | 10;
export type AmountBasis = "tax_included" | "tax_excluded" | "unknown";
export type ResolvedAmountBasis = Exclude<AmountBasis, "unknown">;
export type TaxMode = "external" | "included" | "mixed" | "unknown";
export type RoundingMethod = "floor" | "round" | "ceil" | "unknown";

export type PriceTaxTreatment = "included" | "excluded" | "perItem" | "unknown";
export type TaxRateComposition = "rate8" | "rate10" | "mixed" | "unknown";
export type ReceiptTaxDecisionSource =
  | "user"
  | "explicitLabel"
  | "marker"
  | "position"
  | "reconciliation"
  | "ai";

export type ReceiptTaxDecisionCandidate = {
  priceTaxTreatment: PriceTaxTreatment;
  taxRateComposition: TaxRateComposition;
  resolutionStatus: TaxSummaryDecisionStatus;
  resolutionSource: ReceiptTaxDecisionSource;
  evidence: string[];
  reasons: string[];
};

export type ReceiptTaxAmountDecision = {
  printedTaxYen?: number;
  estimatedTaxYen?: number;
  roundingMethod: RoundingMethod;
  source: "printed" | "estimated" | "unknown";
};

export type ReceiptTaxDecision = ReceiptTaxDecisionCandidate & {
  candidates: ReceiptTaxDecisionCandidate[];
  taxAmount: ReceiptTaxAmountDecision;
};

export type TaxSummaryDecisionStatus = "verified" | "ambiguous" | "contradictory";
export type LegacyTaxSummaryConsistencyStatus = "coherent" | "reconcilable" | "conflicting";
/** Legacy values remain readable until the observation contract migration in #667. */
export type TaxSummaryConsistencyStatus =
  | TaxSummaryDecisionStatus
  | LegacyTaxSummaryConsistencyStatus;

export type TaxSummaryConsistencyReason =
  | "included_mode_with_tax_excluded_basis"
  | "external_mode_with_tax_included_basis"
  | "tax_summary_amount_mismatch"
  | "tax_included_amount_mismatch"
  | "reconciled_to_included"
  | "reconciled_to_external"
  | "mixed_tax_mode"
  | "unresolved_tax_summary";

export type TaxSummaryConsistency = {
  status: TaxSummaryDecisionStatus;
  reasons: TaxSummaryConsistencyReason[];
};

export type ReceiptMarkerDefinition = { marker: string; description: string };

export type ExtractedReceiptItem = {
  itemName: string;
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

export type ExtractedTaxSummary = {
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

export type DraftSummaryOverride = {
  index: number;
  summary: Partial<
    Pick<
      ExtractedTaxSummary,
      | "taxRatePercent"
      | "taxMode"
      | "taxableAmountYen"
      | "taxableAmountBasis"
      | "taxYen"
      | "taxIncludedAmountYen"
    >
  >;
};

export type TaxResolutionSource =
  | "item_explicit"
  | "single_summary"
  | "summary_reconciliation"
  | "remaining_summary"
  | "marker_reconciled"
  | "paid_total_reconciliation";

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
  taxAllocationStatus?: "allocated" | "unallocated";
  normalizedAmountYen: number;
};

export type ReceiptTaxInput = {
  amountYen: number;
  receiptTotalSource?: "explicit_label" | "user_confirmed" | "ai_estimate";
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

export type ReceiptTotalCandidate = {
  amountYen: number;
  source:
    | "explicit_label"
    | "user_confirmed"
    | "ai_estimate"
    | "payment_change"
    | "tax_summary_total"
    | "tax_arithmetic";
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
