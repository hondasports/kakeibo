import { hasLowConfidenceItem } from "./reviewItems";

export type ReviewSummaryItemInput = {
  itemName: string;
  amountYen: string;
  categoryId: string;
  confidence?: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
};

export type ReviewSummaryCategoryInput = {
  _id: string;
  name: string;
};

type ReviewCategoryAggregate = {
  categoryId: string;
  categoryName: string;
  amountYen: number;
};

/** レビュー明細の合計金額を計算する。 */
export function computeReviewItemTotalYen(items: ReviewSummaryItemInput[]): number {
  return items.reduce((sum, item) => sum + (Number(item.amountYen) || 0), 0);
}

/** 未分類の明細が存在するか判定する。 */
export function hasReviewUncategorizedItems(items: ReviewSummaryItemInput[]): boolean {
  return items.some((item) => !item.categoryId);
}

/** 低信頼度の明細が存在するか判定する。 */
export function hasReviewLowConfidenceItems(items: ReviewSummaryItemInput[]): boolean {
  return items.some((item) => hasLowConfidenceItem(item));
}

/**
 * レビュー明細をカテゴリ別に集約する。
 * 未分類の明細は集約対象に含めない。
 */
export function computeReviewCategoryAggregates(
  items: ReviewSummaryItemInput[],
  categories: ReviewSummaryCategoryInput[],
): ReviewCategoryAggregate[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (!item.categoryId) {
      continue;
    }
    const amountYen = Number(item.amountYen) || 0;
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + amountYen);
  }

  return [...totals.entries()].map(([categoryId, amountYen]) => ({
    categoryId,
    categoryName: categories.find((category) => category._id === categoryId)?.name ?? "カテゴリ",
    amountYen,
  }));
}

/**
 * レビュー画面の注意ラベル一覧を返す。
 * 未分類・低信頼度・差額の有無を判定する。
 */
export function getReviewAttentionLabels({
  receiptAmountYen,
  reviewItems,
}: {
  receiptAmountYen: number;
  reviewItems: ReviewSummaryItemInput[];
}): string[] {
  const labels: string[] = [];

  if (hasReviewUncategorizedItems(reviewItems)) {
    labels.push("未分類の明細があります");
  }
  if (hasReviewLowConfidenceItems(reviewItems)) {
    labels.push("低信頼度の明細があります");
  }

  const itemTotal = computeReviewItemTotalYen(reviewItems);
  if (reviewItems.length > 0 && receiptAmountYen - itemTotal !== 0) {
    labels.push("明細合計と合計金額に差額があります");
  }

  return labels;
}
