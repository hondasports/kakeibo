/**
 * LINE サマリ応答生成に必要な読み取りポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { IncomeListEntry, SpendingEntry } from "../receipt/spendingEntry";

/** カテゴリ名+色の写像（byCategory 集計用）。 */
export type CategoryInfo = { name: string; color: string };

/** カテゴリ検索・画像解析ヒント用の最小形状。 */
export type LineCategoryHint = { id: string; name: string; description?: string };

export interface LineSummaryDataReader {
  /** 指定週の支出エントリ（receipts/expenseEntries 統合済み）。 */
  getWeekSpendingEntries(groupId: string, weekStartDate: string): Promise<SpendingEntry[]>;
  /** 指定週の収入エントリ。 */
  getWeekIncomeEntries(groupId: string, weekStartDate: string): Promise<IncomeListEntry[]>;
  /** カテゴリID群から名前・色の写像を組み立てる。 */
  buildCategoryInfoMap(groupId: string, categoryIds: string[]): Promise<Map<string, CategoryInfo>>;
  /** グループの有効カテゴリを sortOrder 順・最大 limit 件取得する。 */
  listActiveCategories(groupId: string, limit: number): Promise<LineCategoryHint[]>;
}
