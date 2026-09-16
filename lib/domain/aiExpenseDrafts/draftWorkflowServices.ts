/**
 * aiExpenseDrafts のワークフローサービス・ポート（domain interface）。
 * 税再解釈の永続化や支出エントリとのリコンサイルなど、
 * 複数テーブルにまたがる永続化オーケストレーションの抽象。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type {
  BulkUnresolvedTaxOverride,
  DraftSummaryOverride,
  DraftTaxOverride,
} from "../receipt/tax/reinterpretDraftTax";
import type { PriceTaxTreatment, TaxRateComposition } from "../receipt/tax/types";
import type { AiExpenseDraftReviewReason } from "./constants";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields, DraftReviewItemInput } from "./aiExpenseDraftItem";
import type { DraftRegistrationItem } from "./registrationItems";

/** 税再解釈の永続化リクエスト。 */
export type DraftTaxInterpretationRequest = {
  draftId: string;
  groupId: string;
  preservedNonTaxReasons?: AiExpenseDraftReviewReason[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
  summaryOverride?: DraftSummaryOverride;
  receiptTotalSource?: "explicit_label" | "user_confirmed" | "ai_estimate";
  decisionOverride?: {
    priceTaxTreatment?: PriceTaxTreatment;
    taxRateComposition?: TaxRateComposition;
  };
};

/** 税解釈を再計算し、下書き・明細へ永続化するサービス。 */
export interface DraftTaxInterpretationService {
  persistInterpretation(
    request: DraftTaxInterpretationRequest,
  ): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] }>;
}

/** ユーザー上書きスナップショット（receiptUserOverride）を永続化するサービス。 */
export interface DraftOverrideSnapshotService {
  persist(args: {
    draftId: string;
    groupId: string;
    fields: string[];
    updatedAt?: number;
  }): Promise<AiExpenseDraftFields>;
}

/** レビュー入力で下書き明細を置き換えるサービス。 */
export interface DraftItemReplaceService {
  replaceForReview(
    draftId: string,
    groupId: string,
    items: DraftReviewItemInput[],
    now: number,
  ): Promise<void>;
}

/** 下書きに紐づく支出エントリを upsert/delete で同期するサービス。 */
export interface DraftExpenseEntryReconcileService {
  reconcile(args: {
    draft: AiExpenseDraftFields;
    groupId: string;
    userId: string;
    items: DraftRegistrationItem[];
    memoUpdate?: { value?: string };
    now: number;
  }): Promise<string[]>;
}

/** 下書き内容から receipts レコードを作成するサービス。 */
export interface DraftReceiptInsertService {
  insert(args: {
    groupId: string;
    userId: string;
    fields: {
      type: "expense";
      date: string;
      shopName: string;
      amountYen: number;
      categoryId: string;
    };
  }): Promise<string>;
}
