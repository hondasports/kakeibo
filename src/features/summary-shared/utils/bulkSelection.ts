import type { ReceiptItem } from "../types/types";

export type SpendingSelectionKey = `${"expenseEntry" | "receipt"}:${string}`;

export function getSpendingSelectionKey(
  receipt: Pick<ReceiptItem, "_id" | "recordType">,
): SpendingSelectionKey {
  return `${receipt.recordType}:${receipt._id}`;
}

export function isSelectableExpenseReceipt(receipt: ReceiptItem): boolean {
  return receipt.type !== "income";
}

export function parseSpendingSelectionKey(key: SpendingSelectionKey): {
  recordType: "expenseEntry" | "receipt";
  id: string;
} {
  const [recordType, ...rest] = key.split(":");
  return {
    recordType: recordType as "expenseEntry" | "receipt",
    id: rest.join(":"),
  };
}

export function partitionSelectedSpendingIds(keys: Iterable<SpendingSelectionKey>): {
  expenseEntryIds: string[];
  receiptIds: string[];
} {
  const expenseEntryIds: string[] = [];
  const receiptIds: string[] = [];

  for (const key of keys) {
    const { recordType, id } = parseSpendingSelectionKey(key);
    if (recordType === "expenseEntry") {
      expenseEntryIds.push(id);
    } else {
      receiptIds.push(id);
    }
  }

  return { expenseEntryIds, receiptIds };
}

export function pruneSelectionToVisibleKeys(
  selectedKeys: Iterable<SpendingSelectionKey>,
  visibleKeys: Iterable<SpendingSelectionKey>,
): Set<SpendingSelectionKey> {
  const visible = new Set(visibleKeys);
  return new Set(Array.from(selectedKeys).filter((key) => visible.has(key)));
}

export function takeKeysUpToLimit(
  keys: SpendingSelectionKey[],
  limit: number,
): { nextKeys: SpendingSelectionKey[]; capped: boolean } {
  if (keys.length <= limit) {
    return { nextKeys: keys, capped: false };
  }
  return { nextKeys: keys.slice(0, limit), capped: true };
}

export function getVisibleSelectableReceipts(receipts: ReceiptItem[]): ReceiptItem[] {
  return receipts.filter(isSelectableExpenseReceipt);
}

export function hasMultipleSourceCategories(receipts: ReceiptItem[]): boolean {
  const categoryIds = new Set(receipts.map((receipt) => receipt.categoryId).filter(Boolean));
  return categoryIds.size > 1;
}
