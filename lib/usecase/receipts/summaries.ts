import {
  summarizeByCategory,
  summarizeReceipts,
  type CategorySummary,
} from "../../domain/receipt/summary";
import {
  mapSpendingEntryToSummaryReceipt,
  type CategoryInfoMap,
  type SummaryReceiptEntry,
} from "../../domain/receipt/summaryEntries";
import { getMonthStartDate } from "../../domain/common/month";
import {
  summarizeYearlyTrend,
  type YearlyMonthSource,
  type YearlySummary,
} from "../../domain/receipt/yearlySummary";
import type { IncomeListEntry, SpendingEntry } from "../../domain/receipt/spendingEntry";
import { calculateRelativeWeekStartDate } from "../../domain/week/weekDates";

export type SummaryStore = {
  getWeekSpendingEntries: (groupId: string, weekStartDate: string) => Promise<SpendingEntry[]>;
  getWeekIncomeEntries: (groupId: string, weekStartDate: string) => Promise<IncomeListEntry[]>;
  getMonthSpendingEntries: (groupId: string, monthStartDate: string) => Promise<SpendingEntry[]>;
  getMonthIncomeEntries: (groupId: string, monthStartDate: string) => Promise<IncomeListEntry[]>;
  getYearAggregationEntries: (groupId: string, year: string) => Promise<YearlyMonthSource[]>;
  buildCategoryInfoMap: (groupId: string, categoryIds: string[]) => Promise<CategoryInfoMap>;
};

export type WeekSummaryResult = {
  count: number;
  totalAmountYen: number;
  prevWeekReceiptCount: number;
  prevWeekTotalAmountYen: number | null;
};

export async function getWeekSummary(
  store: SummaryStore,
  groupId: string,
  args: { weekStartDate: string },
): Promise<WeekSummaryResult> {
  const receipts = await store.getWeekSpendingEntries(groupId, args.weekStartDate);
  const prevWeekStartDate = calculateRelativeWeekStartDate(args.weekStartDate, -1);
  const prevWeekReceipts = await store.getWeekSpendingEntries(groupId, prevWeekStartDate);

  const { count, totalAmountYen } = summarizeReceipts(receipts);
  const prevWeekSummary = summarizeReceipts(prevWeekReceipts);

  return {
    count,
    totalAmountYen,
    prevWeekReceiptCount: prevWeekSummary.count,
    prevWeekTotalAmountYen: prevWeekSummary.count > 0 ? prevWeekSummary.totalAmountYen : null,
  };
}

export type WeekSummaryWithCategoriesResult = {
  count: number;
  totalAmountYen: number;
  totalIncomeYen: number;
  incomeCount: number;
  byCategory: CategorySummary[];
  prevWeekReceiptCount: number;
  prevWeekTotalAmountYen: number | null;
  receipts: SummaryReceiptEntry[];
  incomes: IncomeListEntry[];
};

export async function getWeekSummaryWithCategories(
  store: SummaryStore,
  groupId: string,
  args: { weekStartDate: string },
): Promise<WeekSummaryWithCategoriesResult> {
  const receipts = await store.getWeekSpendingEntries(groupId, args.weekStartDate);
  const prevWeekStartDate = calculateRelativeWeekStartDate(args.weekStartDate, -1);
  const prevWeekReceipts = await store.getWeekSpendingEntries(groupId, prevWeekStartDate);

  const categoryIds = Array.from(new Set(receipts.map((receipt) => receipt.categoryId)));
  const categoryInfoMap = await store.buildCategoryInfoMap(groupId, categoryIds);

  const { count, totalAmountYen } = summarizeReceipts(receipts);
  const prevWeekSummary = summarizeReceipts(prevWeekReceipts);

  const receiptsWithCategory: SummaryReceiptEntry[] = [];
  for (const receipt of receipts) {
    receiptsWithCategory.push(mapSpendingEntryToSummaryReceipt(receipt, categoryInfoMap));
  }

  const byCategory = summarizeByCategory(receipts, categoryInfoMap);

  const incomeEntries = await store.getWeekIncomeEntries(groupId, args.weekStartDate);
  const totalIncomeYen = incomeEntries.reduce((sum, entry) => sum + entry.amountYen, 0);
  const incomeCount = incomeEntries.length;

  return {
    count,
    totalAmountYen,
    totalIncomeYen,
    incomeCount,
    byCategory,
    prevWeekReceiptCount: prevWeekSummary.count,
    prevWeekTotalAmountYen: prevWeekSummary.count > 0 ? prevWeekSummary.totalAmountYen : null,
    receipts: receiptsWithCategory,
    incomes: incomeEntries,
  };
}

export type FourWeeksSummaryResult = {
  /** 直近4週分の集計データ。古い順（昇順）で返す */
  weeks: Array<{
    weekStartDate: string;
    totalAmountYen: number;
    byCategory: CategorySummary[];
  }>;
  /** データが存在する週の数（グラフ表示判定に使用） */
  weekCount: number;
};

export async function getFourWeeksSummary(
  store: SummaryStore,
  groupId: string,
  args: { weekStartDate: string },
): Promise<FourWeeksSummaryResult> {
  const weeklyReceipts: Array<{ weekStartDate: string; receipts: SpendingEntry[] }> = [];
  const allCategoryIds = new Set<string>();

  for (let i = 0; i < 4; i++) {
    const targetWeekStartDate = calculateRelativeWeekStartDate(args.weekStartDate, -i);
    const receipts = await store.getWeekSpendingEntries(groupId, targetWeekStartDate);
    weeklyReceipts.push({ weekStartDate: targetWeekStartDate, receipts });
    for (const receipt of receipts) {
      allCategoryIds.add(receipt.categoryId);
    }
  }

  const categoryInfoMap = await store.buildCategoryInfoMap(groupId, Array.from(allCategoryIds));

  const descWeeks = weeklyReceipts.map(({ weekStartDate, receipts }) => {
    const { totalAmountYen } = summarizeReceipts(receipts);
    return {
      weekStartDate,
      totalAmountYen,
      byCategory: summarizeByCategory(receipts, categoryInfoMap),
    };
  });

  // 古い順（昇順）に並べ替え
  const weeks = descWeeks.reverse();

  const weekCount = weeks.filter((w) => w.totalAmountYen > 0).length;

  return { weeks, weekCount };
}

export type MonthlySummaryWithCategoriesResult = {
  count: number;
  totalAmountYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
  incomeCount: number;
  byCategory: CategorySummary[];
  receipts: SummaryReceiptEntry[];
  incomes: IncomeListEntry[];
};

export async function getMonthSummaryWithCategories(
  store: SummaryStore,
  groupId: string,
  args: { month: string },
): Promise<MonthlySummaryWithCategoriesResult> {
  const monthStartDate = getMonthStartDate(args.month);
  const receipts = await store.getMonthSpendingEntries(groupId, monthStartDate);
  const incomes = await store.getMonthIncomeEntries(groupId, monthStartDate);

  const categoryIds = Array.from(new Set(receipts.map((receipt) => receipt.categoryId)));
  const categoryInfoMap = await store.buildCategoryInfoMap(groupId, categoryIds);
  const { count, totalAmountYen } = summarizeReceipts(receipts);
  const totalIncomeYen = incomes.reduce((sum, income) => sum + income.amountYen, 0);

  const receiptsWithCategory = receipts.map((receipt) =>
    mapSpendingEntryToSummaryReceipt(receipt, categoryInfoMap),
  );

  return {
    count,
    totalAmountYen,
    totalIncomeYen,
    netAmountYen: totalIncomeYen - totalAmountYen,
    incomeCount: incomes.length,
    byCategory: summarizeByCategory(receipts, categoryInfoMap),
    receipts: receiptsWithCategory,
    incomes,
  };
}

export async function getYearSummary(
  store: SummaryStore,
  groupId: string,
  args: { year: string },
): Promise<YearlySummary> {
  const monthSources = await store.getYearAggregationEntries(groupId, args.year);
  const categoryIds = new Set<string>();
  for (const source of monthSources) {
    for (const expense of source.expenses) {
      categoryIds.add(expense.categoryId);
    }
  }

  const categoryInfoMap = await store.buildCategoryInfoMap(groupId, Array.from(categoryIds));
  return summarizeYearlyTrend({
    year: args.year,
    months: monthSources,
    categoryInfoMap,
  });
}
