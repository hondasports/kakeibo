/**
 * 支出一括操作の監査スナップショット構築に関するドメインルール。
 */

export const BULK_SPENDING_CATEGORY_CHANGED_ACTION = "spending_bulk_category_changed" as const;
export const BULK_SPENDING_DELETED_ACTION = "spending_bulk_deleted" as const;

export type BulkSpendingAuditRecord = {
  id: string;
  kind: "expenseEntry" | "receipt";
  date: string;
  categoryId?: string;
};

export type BulkSpendingAuditSnapshot = {
  recordCount: number;
  expenseEntryIds: string[];
  receiptIds: string[];
  dates: string[];
  previousCategoryIds: string[];
  previousCategoryNames: string[];
  categoryId?: string;
  categoryName?: string;
};

export function uniqueInOrder(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

export function buildBulkSpendingAuditSnapshot(
  records: BulkSpendingAuditRecord[],
  categoryNamesById: Map<string, string>,
  nextCategory?: { categoryId: string; categoryName: string },
): BulkSpendingAuditSnapshot {
  const previousCategoryIds = uniqueInOrder(records.map((record) => record.categoryId));
  const snapshot: BulkSpendingAuditSnapshot = {
    recordCount: records.length,
    expenseEntryIds: records
      .filter((record) => record.kind === "expenseEntry")
      .map((record) => record.id),
    receiptIds: records.filter((record) => record.kind === "receipt").map((record) => record.id),
    dates: uniqueInOrder(records.map((record) => record.date)),
    previousCategoryIds,
    previousCategoryNames: previousCategoryIds.map(
      (categoryId) => categoryNamesById.get(categoryId) ?? "不明なカテゴリ",
    ),
  };

  if (nextCategory) {
    snapshot.categoryId = nextCategory.categoryId;
    snapshot.categoryName = nextCategory.categoryName;
  }

  return snapshot;
}

export function formatBulkSpendingAuditTargetLabel(
  snapshot: BulkSpendingAuditSnapshot,
  action: typeof BULK_SPENDING_CATEGORY_CHANGED_ACTION | typeof BULK_SPENDING_DELETED_ACTION,
): string {
  const countLabel = `支出明細${snapshot.recordCount}件`;
  if (action === BULK_SPENDING_DELETED_ACTION) {
    return countLabel;
  }

  const previous = snapshot.previousCategoryNames.join("、") || "不明なカテゴリ";
  const next = snapshot.categoryName ?? "不明なカテゴリ";
  return `${countLabel}: ${previous} → ${next}`;
}
