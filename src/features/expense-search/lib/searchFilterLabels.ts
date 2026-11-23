import { formatYen } from "../../../../lib/domain/common/currency";
import {
  DEFAULT_HISTORY_SORT_ORDER,
  UNCATEGORIZED_CATEGORY_ID,
  type HistorySortOrder,
} from "../../../../lib/domain/expenseSearch/filter";
import {
  expenseSearchFormToSearchParams,
  readExpenseSearchFormState,
  type ExpenseSearchFormState,
} from "./searchParams";

export type SearchFilterChipKey =
  | "entryType"
  | "shopQuery"
  | "categoryId"
  | "minAmountYen"
  | "maxAmountYen"
  | "dateRange";

export const SORT_ORDER_LABELS: Record<HistorySortOrder, string> = {
  dateDesc: "日付が新しい順",
  dateAsc: "日付が古い順",
  amountDesc: "金額が大きい順",
};

/** 適用中の絞り込みを、チップや要約に使うラベルへ変換する（表示順）。 */
export function describeSearchFilters(
  state: ExpenseSearchFormState,
  categoryLabel?: string,
): Array<{ key: SearchFilterChipKey; label: string }> {
  const chips: Array<{ key: SearchFilterChipKey; label: string }> = [];
  if (state.entryType !== "all") {
    chips.push({ key: "entryType", label: state.entryType === "expense" ? "支出" : "収入" });
  }
  if (state.shopQuery) {
    chips.push({ key: "shopQuery", label: `キーワード: ${state.shopQuery}` });
  }
  if (state.categoryId) {
    chips.push({ key: "categoryId", label: `カテゴリ: ${categoryLabel ?? "指定"}` });
  }
  if (state.minAmountYen) {
    chips.push({ key: "minAmountYen", label: `${formatYen(Number(state.minAmountYen))}以上` });
  }
  if (state.maxAmountYen) {
    chips.push({ key: "maxAmountYen", label: `${formatYen(Number(state.maxAmountYen))}以下` });
  }
  if (state.startDate || state.endDate) {
    chips.push({
      key: "dateRange",
      label: `${state.startDate || "指定なし"}〜${state.endDate || "指定なし"}`,
    });
  }
  return chips;
}

/** 並び順を除いた絞り込みが1つ以上あるか（保存・最近の検索へ記録できる条件か）。 */
export function hasSearchCondition(state: ExpenseSearchFormState): boolean {
  return (
    expenseSearchFormToSearchParams({ ...state, sortOrder: DEFAULT_HISTORY_SORT_ORDER }).size > 0
  );
}

/**
 * 保存・最近の検索の query 文字列を、人が読める要約にする。
 * categoryNames が undefined の間はカテゴリ名を「読み込み中」とする。
 */
export function summarizeSearchQuery(
  query: string,
  categoryNames: ReadonlyMap<string, string> | undefined,
): string {
  const state = readExpenseSearchFormState(new URLSearchParams(query));
  const categoryLabel =
    state.categoryId === UNCATEGORIZED_CATEGORY_ID
      ? "未分類"
      : categoryNames === undefined
        ? "読み込み中"
        : (categoryNames.get(state.categoryId) ?? "不明");
  const labels = describeSearchFilters(state, categoryLabel).map((chip) => chip.label);
  if (state.sortOrder !== DEFAULT_HISTORY_SORT_ORDER) {
    labels.push(SORT_ORDER_LABELS[state.sortOrder]);
  }
  return labels.length > 0 ? labels.join("、") : "すべての履歴";
}
