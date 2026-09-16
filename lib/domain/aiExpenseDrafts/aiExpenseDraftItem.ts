/**
 * aiExpenseDraftItems のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { ReceiptItemLineType } from "../receipt/discountItems";
import type { AmountBasis, TaxRatePercent, TaxResolutionSource } from "../receipt/tax/types";

/** aiExpenseDraftItems ドキュメントのフィールド。id/creationTime は永続化済みの場合のみ存在する。 */
export type AiExpenseDraftItemFields = {
  id?: string;
  creationTime?: number;
  groupId: string;
  draftId: string;
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
  categoryId?: string;
  confidence: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
  createdAt: number;
  updatedAt: number;
};

/** レビュー更新で明細を置き換える際の入力。 */
export type DraftReviewItemInput = {
  itemId?: string;
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  categoryId: string;
  confidence?: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};
