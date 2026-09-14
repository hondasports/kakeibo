/**
 * レビュー入力で下書き明細を置き換える際の純粋ルール。
 * 上限・itemId 検証・置換明細フィールドの構築を担い、永続化は infra に委ねる。
 */
import { isValidSignedLineItemAmount } from "../receipt/discountItems";
import { trimOptional } from "../common/string";
import type { AiExpenseDraftItemFields, DraftReviewItemInput } from "./aiExpenseDraftItem";
import { resolveReviewItemAmountsForReplace } from "./reviewItemAmounts";

export const MAX_DRAFT_REVIEW_ITEMS = 100;

export type ReviewItemReplaceError =
  | "too_many_items"
  | "duplicate_item_id"
  | "item_not_in_draft"
  | "name_or_amount_required";

const reviewItemReplaceErrorMessages: Record<ReviewItemReplaceError, string> = {
  too_many_items: "Draft items must be 100 or fewer",
  duplicate_item_id: "Draft item ID must not be duplicated",
  item_not_in_draft: "Draft item does not belong to the current draft",
  name_or_amount_required: "Draft item name and amount are required",
};

export function getReviewItemReplaceErrorMessage(error: ReviewItemReplaceError): string {
  return reviewItemReplaceErrorMessages[error];
}

/** 送信明細数の上限を検証する。既存明細の取得前に行う。 */
export function validateReviewItemCount(
  items: readonly unknown[],
): { success: true } | { success: false; error: "too_many_items" } {
  if (items.length > MAX_DRAFT_REVIEW_ITEMS) {
    return { success: false, error: "too_many_items" };
  }
  return { success: true };
}

/** 送信された itemId が重複せず、すべて現在の下書きの明細を指すことを検証する。 */
export function validateReviewItemIds(
  items: readonly { itemId?: string }[],
  existingItemIds: ReadonlySet<string>,
): { success: true } | { success: false; error: "duplicate_item_id" | "item_not_in_draft" } {
  const submitted = new Set<string>();
  for (const item of items) {
    if (item.itemId === undefined) {
      continue;
    }
    if (submitted.has(item.itemId)) {
      return { success: false, error: "duplicate_item_id" };
    }
    if (!existingItemIds.has(item.itemId)) {
      return { success: false, error: "item_not_in_draft" };
    }
    submitted.add(item.itemId);
  }
  return { success: true };
}

/**
 * 置換後の明細フィールドを構築する。
 * previous があれば税関連フィールドを継承し、金額は resolveReviewItemAmountsForReplace で解決する。
 */
export function buildReplacementDraftItemFields(args: {
  groupId: string;
  draftId: string;
  item: DraftReviewItemInput;
  previous: AiExpenseDraftItemFields | undefined;
  now: number;
}):
  | { success: true; fields: AiExpenseDraftItemFields }
  | { success: false; error: "name_or_amount_required" } {
  const { groupId, draftId, item, previous, now } = args;
  const itemName = trimOptional(item.itemName);
  const lineType = item.lineType ?? previous?.lineType;
  if (!itemName || !isValidSignedLineItemAmount(itemName, item.amountYen, lineType)) {
    return { success: false, error: "name_or_amount_required" };
  }
  const amounts = resolveReviewItemAmountsForReplace(item.amountYen, previous);
  return {
    success: true,
    fields: {
      groupId,
      draftId,
      itemName,
      lineType,
      amountYen: amounts.amountYen,
      printedAmountYen: amounts.printedAmountYen,
      categoryId: item.categoryId,
      amountBasis: previous?.amountBasis,
      taxRatePercent: previous?.taxRatePercent,
      markers: previous?.markers,
      taxMarker: previous?.taxMarker,
      allocatedTaxYen: previous?.allocatedTaxYen,
      taxAllocationStatus: "unallocated",
      normalizedAmountYen:
        "normalizedAmountYen" in amounts
          ? amounts.normalizedAmountYen
          : previous?.normalizedAmountYen,
      taxResolutionStatus: previous?.taxResolutionStatus,
      taxResolutionSource: previous?.taxResolutionSource,
      taxReviewReasons: previous?.taxReviewReasons,
      quantity: previous?.quantity,
      unitPriceYen: previous?.unitPriceYen,
      categoryName: previous?.categoryName,
      confidence: item.confidence ?? {
        itemName: 1,
        amountYen: 1,
        categoryId: 1,
      },
      warnings: item.warnings ?? previous?.warnings,
      createdAt: now,
      updatedAt: now,
    },
  };
}
