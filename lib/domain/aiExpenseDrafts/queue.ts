export type QueueItemSummary = {
  id: string;
  reviewReasons?: string[];
  itemDifferenceYen?: number;
  hasUncategorizedItems?: boolean;
  amountYen?: number;
};

type QueueGroupedItems<T extends QueueItemSummary> = {
  processing: T[];
  ready: T[];
  needs_review: T[];
  failed: T[];
  registered: T[];
};

type QueueContentSummary<T extends QueueItemSummary> = {
  failedCount: number;
  firstReviewItem: T | undefined;
  needsReviewCount: number;
  prioritizedReviewItems: T[];
  processingCount: number;
  selectedTotalAmountYen: number;
};

/**
 * キューアイテムのレビュー優先度を返す。
 * 0: 金額不一致、1: 未分類、その他: 2
 */
export function getReviewPriority(item: QueueItemSummary): number {
  const reasons = item.reviewReasons ?? [];
  if (reasons.includes("amount_mismatch") || (item.itemDifferenceYen ?? 0) !== 0) {
    return 0;
  }
  if (reasons.includes("ambiguous_category") || item.hasUncategorizedItems) {
    return 1;
  }
  return 2;
}

/**
 * キューの内容サマリーを計算する。
 * needs_review は優先度順にソートされる。
 */
export function getQueueContentSummary<T extends QueueItemSummary>({
  groupedItems,
  readyItems,
  selectedReadyIds,
}: {
  groupedItems: QueueGroupedItems<T>;
  readyItems: T[];
  selectedReadyIds: string[];
}): QueueContentSummary<T> {
  const needsReviewCount = groupedItems.needs_review.length;
  const processingCount = groupedItems.processing.length;
  const failedCount = groupedItems.failed.length;
  const selectedReadyItems = readyItems.filter((item) => selectedReadyIds.includes(item.id));
  const prioritizedReviewItems = [...groupedItems.needs_review].sort(
    (left, right) => getReviewPriority(left) - getReviewPriority(right),
  );
  const firstReviewItem = prioritizedReviewItems[0];
  const selectedTotalAmountYen = selectedReadyItems.reduce(
    (total, item) => total + (item.amountYen ?? 0),
    0,
  );

  return {
    failedCount,
    firstReviewItem,
    needsReviewCount,
    prioritizedReviewItems,
    processingCount,
    selectedTotalAmountYen,
  };
}
