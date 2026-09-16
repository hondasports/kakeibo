/**
 * 支出一括操作（expenseEntries / receipts の横断選択）に関するドメインルール。
 * 選択数上限・ID 正規化・収入除外の知識を集約する。
 */

export const MAX_BULK_SPENDING_SELECTION = 100;

export type BulkSpendingIdSets = {
  expenseEntryIds: string[];
  receiptIds: string[];
};

export function dedupeIds<T extends string>(ids: T[]): T[] {
  return Array.from(new Set(ids));
}

export function countBulkSpendingIds(args: BulkSpendingIdSets): number {
  return dedupeIds(args.expenseEntryIds).length + dedupeIds(args.receiptIds).length;
}

export function isExpenseReceiptType(type: "expense" | "income" | undefined): boolean {
  return type === undefined || type === "expense";
}

export function getBulkSpendingLimitErrorMessage(): string {
  return `一度に選べる明細は${MAX_BULK_SPENDING_SELECTION}件までです`;
}

export function canSelectAnotherSpendingRecord(selectedCount: number): boolean {
  return selectedCount < MAX_BULK_SPENDING_SELECTION;
}

export type BulkSpendingIdsError = "empty" | "too_many";

export type NormalizedBulkSpendingIds = {
  expenseEntryIds: string[];
  receiptIds: string[];
  totalCount: number;
};

/**
 * 一括操作対象の ID 集合を正規化する（重複除去 + 件数制約）。
 */
export function normalizeBulkSpendingIds(
  args: BulkSpendingIdSets,
):
  | { success: true; data: NormalizedBulkSpendingIds }
  | { success: false; error: BulkSpendingIdsError } {
  const expenseEntryIds = dedupeIds(args.expenseEntryIds);
  const receiptIds = dedupeIds(args.receiptIds);
  const totalCount = expenseEntryIds.length + receiptIds.length;

  if (totalCount === 0) {
    return { success: false, error: "empty" };
  }
  if (totalCount > MAX_BULK_SPENDING_SELECTION) {
    return { success: false, error: "too_many" };
  }

  return { success: true, data: { expenseEntryIds, receiptIds, totalCount } };
}
