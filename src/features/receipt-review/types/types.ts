import type {
  ExtractedTaxSummary,
  PriceTaxTreatment,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
  TaxRateComposition,
  TaxResolutionSource,
} from "../../../../lib/receiptTax/types";
import type { ReceiptRawObservation } from "../../../../lib/domain/receipt/observations";
import type {
  AiExpenseRegistrationMode,
  DerivedRegistrationSnapshot,
  ReceiptInterpretationSnapshot,
  ReceiptUserOverrideSnapshot,
} from "../../../../lib/domain/aiExpenseDrafts/receiptDataContract";
import type { ReceiptItemLineType } from "../../../../lib/domain/receipt/discountItems";

export type AiExpenseQueueDocumentType = "receipt" | "convenience_payment" | "unknown";

export type AiExpenseDraftStatus = "ready" | "needs_review" | "failed" | "registered";

export type AiExpenseDraft = {
  _id: string;
  status: AiExpenseDraftStatus;
  documentType: AiExpenseQueueDocumentType;
  imageFileName?: string;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  categoryId?: string;
  reviewReasons: string[];
  warnings?: string[];
  taxSummaries?: Array<Omit<ExtractedTaxSummary, "confidence">>;
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  receiptDataContractVersion?: 1;
  rawObservation?: ReceiptRawObservation;
  receiptInterpretation?: ReceiptInterpretationSnapshot;
  receiptUserOverride?: ReceiptUserOverrideSnapshot;
  registrationMode?: AiExpenseRegistrationMode;
  derivedRegistration?: DerivedRegistrationSnapshot;
  markerDefinitions?: Array<{ marker: string; description: string }>;
  itemSummary?: {
    itemTotalYen: number;
    itemDifferenceYen?: number;
    hasUncategorizedItems: boolean;
    hasLowConfidenceItems: boolean;
    categoryAggregates: Array<{
      categoryId: string;
      amountYen: number;
    }>;
  };
};

export type AiExpenseItemTaxDetails = {
  printedAmountYen?: number;
  amountBasis?: "tax_included" | "tax_excluded" | "unknown";
  taxRatePercent?: 0 | 8 | 10 | null;
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
};

export type AiExpenseDraftItem = AiExpenseItemTaxDetails & {
  _id?: string;
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  categoryName?: string;
  categoryId?: string;
  confidence?: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};

export type AiExpenseDraftWithItems = {
  draft: AiExpenseDraft;
  items: AiExpenseDraftItem[];
};

export type ReviewFormValues = {
  documentType: AiExpenseQueueDocumentType;
  shopName: string;
  date: string;
  amountYen: string;
  categoryId: string;
  registrationMode: AiExpenseRegistrationMode;
  priceTaxTreatment?: PriceTaxTreatment;
  taxRateComposition?: TaxRateComposition;
};

export type ReviewItemValues = AiExpenseItemTaxDetails & {
  id: string;
  persistedItemId?: string;
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: string;
  categoryId: string;
  usesReceiptCategory?: boolean;
  discountTargetItemId?: string;
  confidence?: AiExpenseDraftItem["confidence"];
  warnings?: string[];
};

export type AiExpenseReviewSubmitResult = {
  status: AiExpenseDraftStatus;
  reviewReasons: string[];
};
