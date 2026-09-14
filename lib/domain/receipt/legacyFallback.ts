/**
 * expenseEntries（新形式）と receipts（旧形式）のフォールバック判定に関する純粋ルール。
 * 移行途中のデータで新旧が混在しても、同じ種別の新形式がある場合だけ旧形式を抑止する。
 */
import { getYearMonths } from "../common/year";
import { getMonthEndDate } from "../common/date";

export type EntryKind = "expense" | "income";

/** 判定に必要な expenseEntries の最小形状。 */
export type FallbackExpenseEntry = { entryType: EntryKind };
/** 判定に必要な receipts の最小形状。type 未設定は支出扱い。 */
export type FallbackReceipt = { type?: EntryKind };

export function isEntryOfKind(entry: FallbackExpenseEntry, kind: EntryKind): boolean {
  return kind === "income" ? entry.entryType === "income" : entry.entryType !== "income";
}

export function isReceiptOfKind(receipt: FallbackReceipt, kind: EntryKind): boolean {
  return kind === "income" ? receipt.type === "income" : receipt.type !== "income";
}

export function filterEntriesByKind<T extends FallbackExpenseEntry>(
  entries: readonly T[],
  kind: EntryKind,
): T[] {
  return entries.filter((entry) => isEntryOfKind(entry, kind));
}

export function filterReceiptsByKind<T extends FallbackReceipt>(
  receipts: readonly T[],
  kind: EntryKind,
): T[] {
  return receipts.filter((receipt) => isReceiptOfKind(receipt, kind));
}

/**
 * 週の収入ソース判定。
 * 収入の新形式があればそれを使い、支出だけ新形式がある週は旧形式で補完しない。
 */
export type WeekIncomeSource = "new" | "none" | "legacy";

export function resolveWeekIncomeSource(
  entries: readonly FallbackExpenseEntry[],
): WeekIncomeSource {
  if (entries.some((entry) => entry.entryType === "income")) return "new";
  if (entries.length > 0) return "none";
  return "legacy";
}

/** 月集計: 支出・収入とも新形式があるときだけ旧形式の取得を省略できる。 */
export function needsLegacyReceiptsForMonthAggregation(
  entries: readonly FallbackExpenseEntry[],
): boolean {
  const hasNewExpenses = entries.some((entry) => entry.entryType !== "income");
  const hasNewIncomes = entries.some((entry) => entry.entryType === "income");
  return !(hasNewExpenses && hasNewIncomes);
}

/** 年集計: いずれかの月で種別が欠けていれば旧形式を取得する。 */
export function needsLegacyReceiptsForYearAggregation(
  months: readonly string[],
  entriesByMonth: ReadonlyMap<string, readonly FallbackExpenseEntry[]>,
): boolean {
  return months.some((month) =>
    needsLegacyReceiptsForMonthAggregation(entriesByMonth.get(month) ?? []),
  );
}

export type AggregationExpense = { amountYen: number; categoryId: string };
export type AggregationIncome = { amountYen: number };

export type AggregationExpenseEntry = FallbackExpenseEntry & {
  amount: number;
  categoryId?: string;
};
export type AggregationReceipt = FallbackReceipt & { amountYen: number; categoryId: string };

export type AggregationEntriesError = "expense_category_required";

export const AGGREGATION_EXPENSE_CATEGORY_REQUIRED_MESSAGE =
  "Expense entry category is required for spending aggregation";

/**
 * 集計入力へ変換する。種別ごとに新形式が無ければ旧形式へフォールバックする。
 */
export function mapAggregationEntries(
  expenseEntries: readonly AggregationExpenseEntry[],
  receipts: readonly AggregationReceipt[],
):
  | { success: true; expenses: AggregationExpense[]; incomes: AggregationIncome[] }
  | { success: false; error: AggregationEntriesError } {
  const monthExpenseEntries = filterEntriesByKind(expenseEntries, "expense");
  const monthIncomeEntries = filterEntriesByKind(expenseEntries, "income");

  const expenses: AggregationExpense[] = [];
  if (monthExpenseEntries.length === 0) {
    for (const receipt of filterReceiptsByKind(receipts, "expense")) {
      expenses.push({ amountYen: receipt.amountYen, categoryId: receipt.categoryId });
    }
  } else {
    for (const entry of monthExpenseEntries) {
      if (entry.categoryId === undefined) {
        return { success: false, error: "expense_category_required" };
      }
      expenses.push({ amountYen: entry.amount, categoryId: entry.categoryId });
    }
  }

  const incomes: AggregationIncome[] =
    monthIncomeEntries.length === 0
      ? filterReceiptsByKind(receipts, "income").map((receipt) => ({
          amountYen: receipt.amountYen,
        }))
      : monthIncomeEntries.map((entry) => ({ amountYen: entry.amount }));

  return { success: true, expenses, incomes };
}

/** 期間内のドキュメントを YYYY-MM でグルーピングする。範囲外は除外する。 */
export function groupDocsByMonth<T extends { date: string }>(
  docs: readonly T[],
  startDate: string,
  endDate: string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const doc of docs) {
    if (doc.date < startDate || doc.date > endDate) {
      continue;
    }
    const month = doc.date.slice(0, 7);
    const bucket = grouped.get(month);
    if (bucket === undefined) {
      grouped.set(month, [doc]);
    } else {
      bucket.push(doc);
    }
  }
  return grouped;
}

export const INVALID_YEAR_MESSAGE = "Invalid year";

/** 年から12ヶ月と取得範囲（初月1日〜末月末日）を解決する。 */
export function resolveYearRange(
  year: string,
): { success: true; months: string[]; startDate: string; endDate: string } | { success: false } {
  const months = getYearMonths(year);
  const firstMonth = months[0];
  const lastMonth = months[11];
  if (firstMonth === undefined || lastMonth === undefined) {
    return { success: false };
  }
  return {
    success: true,
    months,
    startDate: `${firstMonth}-01`,
    endDate: getMonthEndDate(`${lastMonth}-01`),
  };
}
