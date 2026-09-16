import {
  isReceiptOfKind,
  type FallbackExpenseEntry,
  type FallbackReceipt,
} from "../receipt/legacyFallback";

/**
 * 移行期間は新旧sourceが同じ月に共存しうる。source間には同一明細を
 * 判定できるlinkがないため、日付・金額・名称での推測dedupeは行わず、
 * sourceとIDが同じものだけを重複排除する。
 */
export function dedupeSearchEntries<T extends { _id: string; recordType: string }>(
  entries: readonly T[],
): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const sourceKey = `${entry.recordType}:${entry._id}`;
    if (seen.has(sourceKey)) {
      return false;
    }
    seen.add(sourceKey);
    return true;
  });
}

export type SearchKindPartition<T> = {
  expenses: T[];
  incomes: T[];
};

/** 新形式エントリを支出・収入へ振り分ける（厳密等価。expense/income 以外は除外）。 */
export function partitionExpenseEntriesByKind<T extends FallbackExpenseEntry>(
  entries: readonly T[],
): SearchKindPartition<T> {
  return {
    expenses: entries.filter((entry) => entry.entryType === "expense"),
    incomes: entries.filter((entry) => entry.entryType === "income"),
  };
}

/** 旧形式レシートを支出・収入へ振り分ける。type 未設定は支出扱い。 */
export function partitionReceiptsByKind<T extends FallbackReceipt>(
  receipts: readonly T[],
): SearchKindPartition<T> {
  return {
    expenses: receipts.filter((receipt) => isReceiptOfKind(receipt, "expense")),
    incomes: receipts.filter((receipt) => isReceiptOfKind(receipt, "income")),
  };
}

/**
 * 検索履歴の新旧sourceを結合する。新形式を先に置き、
 * source-qualified ID だけで重複排除する。
 */
export function mergeSearchEntrySources<T extends { _id: string; recordType: string }>(
  newSourceEntries: readonly T[],
  legacySourceEntries: readonly T[],
): T[] {
  return dedupeSearchEntries([...newSourceEntries, ...legacySourceEntries]);
}
