/**
 * 収支種別（支出 / 収入）のドメイン定数。
 * expenseEntries.entryType（必須）と receipts.type（後方互換のため optional）が
 * 共有する値集合の正本。optional かどうかの契約差は各フィールド側で表現する。
 */
export const ENTRY_KINDS = ["expense", "income"] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];
