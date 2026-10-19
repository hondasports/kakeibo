import {
  AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD,
  type AiExpenseDraftDocumentType,
} from "./constants";
import { isValidSignedLineItemAmount } from "../receipt/discountItems";
import { resolveReceiptShopNameFromDraft } from "./shopName";

export type ItemConfidence = {
  itemName?: number;
  amountYen?: number;
  categoryName?: number;
  categoryId?: number;
};

export type ReviewItemLike = {
  amountYen: number;
  normalizedAmountYen?: number;
  categoryId?: string;
  confidence: ItemConfidence;
};

export function hasLowConfidenceItem(item: { confidence?: ItemConfidence | undefined }): boolean {
  const confidence = item.confidence ?? {};
  return (
    (confidence.itemName ?? 1) < AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD ||
    (confidence.amountYen ?? 1) < AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD ||
    (confidence.categoryId ?? confidence.categoryName ?? 1) < AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD
  );
}

export type ItemSummary = {
  itemTotalYen: number;
  /** 下書き金額が無い等で差分を出せない場合は省略（Convex では undefined はキー非存在として保存される）。 */
  itemDifferenceYen?: number;
  hasUncategorizedItems: boolean;
  hasLowConfidenceItems: boolean;
  categoryAggregates: Array<{ categoryId: string; amountYen: number }>;
};

export function summarizeItems(
  draft: { amountYen?: number },
  items: ReviewItemLike[],
): ItemSummary | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const categoryAmounts = new Map<string, number>();
  let itemTotalYen = 0;
  let hasUncategorizedItems = false;
  let hasLowConfidenceItems = false;

  for (const item of items) {
    const registrationAmountYen = item.normalizedAmountYen ?? item.amountYen;
    itemTotalYen += registrationAmountYen;
    if (item.categoryId === undefined) {
      hasUncategorizedItems = true;
    } else {
      categoryAmounts.set(
        item.categoryId,
        (categoryAmounts.get(item.categoryId) ?? 0) + registrationAmountYen,
      );
    }
    if (hasLowConfidenceItem(item)) {
      hasLowConfidenceItems = true;
    }
  }

  return {
    itemTotalYen,
    itemDifferenceYen: draft.amountYen === undefined ? undefined : draft.amountYen - itemTotalYen,
    hasUncategorizedItems,
    hasLowConfidenceItems,
    categoryAggregates: Array.from(categoryAmounts.entries()).map(([categoryId, amountYen]) => ({
      categoryId,
      amountYen,
    })),
  };
}

export function validatePositiveCategoryTotals(
  items: Array<{ categoryId: string; amountYen: number }>,
): boolean {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + item.amountYen);
  }
  return [...totals.values()].every((amountYen) => amountYen > 0);
}

export type DraftForAggregation = {
  amountYen: number;
  categoryId: string;
  documentType?: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
};

export type DraftItemForAggregation = {
  itemName: string;
  amountYen: number;
  normalizedAmountYen?: number;
  categoryId?: string;
  confidence: ItemConfidence;
};

export type DraftItemAggregationError =
  | "invalid_item_amount"
  | "missing_category"
  | "low_confidence"
  | "amount_mismatch"
  | "non_positive_category_total";

export function aggregateDraftItemsByCategory(
  draft: DraftForAggregation,
  items: DraftItemForAggregation[],
):
  | { success: true; items: Array<{ itemName: string; amountYen: number; categoryId: string }> }
  | { success: false; error: DraftItemAggregationError } {
  if (items.length === 0) {
    return {
      success: true,
      items: [
        {
          itemName: resolveReceiptShopNameFromDraft(draft),
          amountYen: draft.amountYen,
          categoryId: draft.categoryId,
        },
      ],
    };
  }

  let itemTotal = 0;
  const categoryAmounts = new Map<string, number>();
  for (const item of items) {
    const registrationAmountYen = item.normalizedAmountYen ?? item.amountYen;
    if (!isValidSignedLineItemAmount(item.itemName, registrationAmountYen)) {
      return { success: false, error: "invalid_item_amount" };
    }
    if (item.categoryId === undefined) {
      return { success: false, error: "missing_category" };
    }
    if (hasLowConfidenceItem(item)) {
      return { success: false, error: "low_confidence" };
    }

    itemTotal += registrationAmountYen;
    categoryAmounts.set(
      item.categoryId,
      (categoryAmounts.get(item.categoryId) ?? 0) + registrationAmountYen,
    );
  }

  if (itemTotal !== draft.amountYen) {
    return { success: false, error: "amount_mismatch" };
  }
  if ([...categoryAmounts.values()].some((amountYen) => amountYen <= 0)) {
    return { success: false, error: "non_positive_category_total" };
  }

  const itemNamesByCategory = new Map<string, string[]>();
  for (const item of items) {
    if (item.categoryId === undefined) {
      continue;
    }
    const itemNames = itemNamesByCategory.get(item.categoryId) ?? [];
    itemNames.push(item.itemName.trim());
    itemNamesByCategory.set(item.categoryId, itemNames);
  }

  return {
    success: true,
    items: Array.from(categoryAmounts.entries()).map(([categoryId, amountYen]) => ({
      itemName:
        itemNamesByCategory.get(categoryId)?.join("、") ?? resolveReceiptShopNameFromDraft(draft),
      amountYen,
      categoryId,
    })),
  };
}

const draftItemAggregationErrorMessages: Record<DraftItemAggregationError, string> = {
  invalid_item_amount: "Draft item amount is required to register",
  missing_category: "Draft item category is required to register",
  low_confidence: "Low confidence draft items must be reviewed before register",
  amount_mismatch: "Draft item total must match draft amount",
  non_positive_category_total: "Draft category total must be greater than zero",
};

/** 明細集計エラーをユーザー向けメッセージに変換する */
export function getDraftItemAggregationErrorMessage(error: DraftItemAggregationError): string {
  return draftItemAggregationErrorMessages[error];
}
