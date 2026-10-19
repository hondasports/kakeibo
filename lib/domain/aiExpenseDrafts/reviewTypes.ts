import type { ReceiptItemTaxConfirmedField } from "../receipt/tax/types";
import type {
  ExtractedTaxSummary,
  PriceTaxTreatment,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
  TaxRateComposition,
  TaxResolutionSource,
} from "../receipt/tax/types";
import type { ReceiptRawObservation } from "../receipt/observations";
import type { ItemSummary } from "./reviewItems";
import type {
  AiExpenseRegistrationMode,
  DerivedRegistrationSnapshot,
  ReceiptInterpretationSnapshot,
  ReceiptUserOverrideSnapshot,
} from "./receiptDataContract";
import type { ReceiptItemLineType } from "../receipt/discountItems";
import type {
  AiExpenseDraftDocumentType,
  AiExpenseDraftStatus as PersistedDraftStatus,
} from "./constants";

export type AiExpenseQueueDocumentType = AiExpenseDraftDocumentType;

/** 一覧・レビュー画面で扱う下書き状態。解析中・登録中の status はこの境界には出さない。 */
export type AiExpenseDraftStatus = Extract<
  PersistedDraftStatus,
  "ready" | "needs_review" | "failed" | "registered"
>;

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
  /** 一覧用に付与される明細（ready / needs_review のみ）。確認理由の導出に使う。 */
  items?: AiExpenseDraftItem[];
  itemSummary?: ItemSummary;
  /** 一覧用に永続化された判定サマリ。無い旧データは明細から再計算する（Phase 3 でフォールバックを外す）。 */
  listSummary?: DraftListSummary;
};

/**
 * aiExpenseDrafts.listSummary に保存する一覧用判定結果。
 * 一覧は保存値がある下書きの明細を読まないため、判定入力を変え得る
 * 全書き込み経路で最新化する（組み立ては buildDraftListSummary だけが担う）。
 */
export type DraftListSummary = {
  /** 金額・税内訳が解決済みか（isAmountAndTaxResolved と同じ入力・同じ結果）。 */
  amountAndTaxResolved: boolean;
  /** 明細集計（summarizeItems と同じ。明細0件なら省略）。 */
  itemSummary?: ItemSummary;
};

/**
 * 金額・税内訳の解決判定に必要な入力。
 * 永続化レコード（_id/status が Id や広い status union の AiExpenseDraftFields）と
 * クライアントの AiExpenseDraft の両方を受けられるよう、判定に使わない _id/status を除く。
 */
export type AiExpenseDraftJudgmentInput = Omit<AiExpenseDraft, "_id" | "status">;

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
  taxConfirmedFields?: ReceiptItemTaxConfirmedField[];
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
  confirmedTaxRatePercent?: 0 | 8 | 10 | null;
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
