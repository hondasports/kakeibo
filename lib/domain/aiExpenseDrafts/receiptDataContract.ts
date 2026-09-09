import type {
  AiExpenseDraftConfidence,
  AiExpenseDraftDocumentType,
  AiExpenseDraftReviewReason,
  AiExpenseDraftStatus,
} from "./constants";
import type {
  AmountBasis,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
  TaxRatePercent,
  TaxResolutionSource,
} from "../receipt/tax/types";
import type { ReceiptLineClassification } from "../receipt/observations";
import type { ReceiptItemLineType } from "../receipt/discountItems";

export type ReceiptDraftItemSnapshot<TCategoryId = string> = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: TaxRatePercent | null;
  markers?: string[];
  taxMarker?: string;
  allocatedTaxYen?: number;
  taxAllocationStatus?: "allocated" | "unallocated";
  normalizedAmountYen?: number;
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
  quantity?: number;
  unitPriceYen?: number;
  categoryName?: string;
  categoryId?: TCategoryId;
  confidence: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};

export type ReceiptDraftValueSnapshot<TCategoryId = string> = {
  status: AiExpenseDraftStatus;
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  registrationMode?: AiExpenseRegistrationMode;
  taxSummaries?: ExtractedTaxSummary[];
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  receiptLineClassifications?: ReceiptLineClassification[];
  markerDefinitions?: ReceiptMarkerDefinition[];
  categoryId?: TCategoryId;
  confidence: AiExpenseDraftConfidence;
  warnings: string[];
  reviewReasons: AiExpenseDraftReviewReason[];
  items: ReceiptDraftItemSnapshot<TCategoryId>[];
};

export type ReceiptInterpretationSnapshot<TCategoryId = string> = {
  source: "ai";
  interpretedAt: number;
  values: ReceiptDraftValueSnapshot<TCategoryId>;
};

export type ReceiptUserOverrideSnapshot<TCategoryId = string> = {
  source: "user";
  updatedAt: number;
  fields: string[];
  values: ReceiptDraftValueSnapshot<TCategoryId>;
};

export type AiExpenseRegistrationMode = "detailed" | "totalOnly";

export type DerivedRegistrationSnapshot<TCategoryId = string> = {
  source: "derived";
  destination: "receipt" | "expense_entries";
  registrationMode?: AiExpenseRegistrationMode;
  taxRatePercent?: 0 | 8 | 10 | null;
  taxableAmountYen?: number | null;
  taxYen?: number | null;
  amountYen: number;
  date: string;
  categoryIds: TCategoryId[];
  registeredAt: number;
};

const TOP_LEVEL_OVERRIDE_FIELDS = [
  "documentType",
  "shopName",
  "paymentPlace",
  "payeeName",
  "paymentPurpose",
  "date",
  "amountYen",
  "registrationMode",
  "receiptTotalResolution",
  "receiptTaxDecision",
  "markerDefinitions",
  "categoryId",
] as const;

export function applyReceiptUserOverride<TCategoryId>(
  aiValues: ReceiptDraftValueSnapshot<TCategoryId>,
  override: ReceiptUserOverrideSnapshot<TCategoryId> | undefined,
): ReceiptDraftValueSnapshot<TCategoryId> {
  if (override === undefined) {
    return aiValues;
  }

  const fields = new Set(override.fields);
  const merged: ReceiptDraftValueSnapshot<TCategoryId> = {
    ...aiValues,
    confidence: { ...aiValues.confidence },
  };
  for (const field of TOP_LEVEL_OVERRIDE_FIELDS) {
    if (!fields.has(field)) {
      continue;
    }
    merged[field] = override.values[field] as never;
    const confidenceField = field as keyof typeof merged.confidence;
    if (override.values.confidence[confidenceField] !== undefined) {
      merged.confidence[confidenceField] = override.values.confidence[confidenceField];
    }
  }
  if (fields.has("items")) {
    merged.items = override.values.items;
  }
  if (fields.has("taxSummaries")) {
    merged.taxSummaries = override.values.taxSummaries;
  }
  return merged;
}
