import type { Id } from "../../convex/_generated/dataModel";
import type { PriceTaxTreatment, TaxRateComposition } from "../../lib/receiptTax/types";
import type { ReceiptItemLineType } from "../../lib/domain/receipt/discountItems";
import type { AiExpenseRegistrationMode } from "../../lib/domain/aiExpenseDrafts/receiptDataContract";
import type {
  AiExpenseDraft,
  AiExpenseDraftItem,
  AiExpenseQueueDocumentType,
  AiExpenseReviewSubmitResult,
} from "../features/receipt-review/types/types";

export type AiExpenseQueueStatus =
  | "adding"
  | "queued"
  | "analyzing"
  | "ready"
  | "needs_review"
  | "failed"
  | "registering"
  | "registered";

export type AiExpenseQueueItem = {
  id: string;
  fileName?: string;
  previewImageDataUrl?: string;
  failureHint?: string;
  warnings?: string[];
  /** セッション中だけ使う解析ジョブとの紐付け。永続化しない。 */
  jobId?: string;
  /** セッション中だけ使う解析バッチとの紐付け。永続化しない。 */
  batchId?: string;
  status: AiExpenseQueueStatus;
  documentType: AiExpenseQueueDocumentType;
  title?: string;
  amountYen?: number;
  date?: string;
  categoryName?: string;
  reviewReasons?: string[];
  itemTotalYen?: number;
  itemDifferenceYen?: number;
  hasUncategorizedItems?: boolean;
  hasLowConfidenceItems?: boolean;
  categoryAggregates?: Array<{
    categoryId: string;
    categoryName?: string;
    amountYen: number;
  }>;
  registrationMode?: AiExpenseRegistrationMode;
};

export type QueueSectionKey = "processing" | "ready" | "needs_review" | "failed" | "registered";

export type AiExpenseQueueCategory = {
  _id: Id<"categories"> | string;
  name: string;
  color: string;
};

export type AiExpenseQueuePanelProps = {
  initialItems?: AiExpenseQueueItem[];
  categories?: AiExpenseQueueCategory[];
  initialReviewDrafts?: Record<string, AiExpenseDraft>;
  initialReviewDraftItems?: Record<string, AiExpenseDraftItem[]>;
  onReviewSubmit?: (
    draftId: string,
    values: {
      documentType: AiExpenseQueueDocumentType;
      shopName: string;
      date: string;
      amountYen: number;
      categoryId: string;
      items?: Array<{
        itemName: string;
        lineType?: ReceiptItemLineType;
        amountYen: number;
        categoryId: string;
      }>;
      registrationMode?: AiExpenseRegistrationMode;
      priceTaxTreatment?: PriceTaxTreatment;
      taxRateComposition?: TaxRateComposition;
    },
    registerAfterUpdate: boolean,
  ) => Promise<AiExpenseReviewSubmitResult> | AiExpenseReviewSubmitResult;
};
