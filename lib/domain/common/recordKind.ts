/**
 * 支出・収入の統合一覧で使うレコード種別の値集合の正本。
 * expenseEntries（新テーブル）と receipts（旧テーブル）のどちら由来かを表す。
 */
export const RECORD_TYPES = ["expenseEntry", "receipt"] as const;

export type RecordType = (typeof RECORD_TYPES)[number];
