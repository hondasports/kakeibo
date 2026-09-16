import {
  buildHistoryComparison,
  buildHistoryTrend,
  calculatePreviousHistoryPeriod,
  summarizeHistoryGroups,
} from "../../domain/expenseSearch/analytics";
import {
  filterHistoryGroups,
  groupHistoryEntries,
  paginateHistoryGroups,
  parseExpenseSearchFilters,
  type SearchableHistoryGroup,
} from "../../domain/expenseSearch/filter";
import {
  collectCategoryIds,
  emptySearchResult,
  ExpenseSearchDomainError,
  mapHistoryGroupToItems,
  type ExpenseSearchResult,
} from "../../domain/expenseSearch/searchResult";
import type { IncomeListEntry, SpendingEntry } from "../../domain/receipt/spendingEntry";

export type SearchHistorySource = {
  entries: SpendingEntry[];
  incomes: IncomeListEntry[];
  truncated: boolean;
};

export type ExpenseSearchStore = {
  getCategoryGroupId: (categoryId: string) => Promise<string | undefined>;
  loadHistoryEntries: (
    groupId: string,
    startDate: string | undefined,
    endDate: string | undefined,
  ) => Promise<SearchHistorySource>;
  buildCategoryInfoMap: (
    groupId: string,
    categoryIds: string[],
  ) => Promise<Map<string, { name: string; color: string }>>;
};

export type SearchExpensesInput = {
  entryType?: "all" | "expense" | "income";
  shopQuery?: string;
  categoryId?: string;
  minAmountYen?: number;
  maxAmountYen?: number;
  startDate?: string;
  endDate?: string;
  paginationOpts: { numItems: number; cursor: string | null };
};

export async function searchExpenses(
  store: ExpenseSearchStore,
  groupId: string,
  args: SearchExpensesInput,
): Promise<ExpenseSearchResult> {
  const parsed = parseExpenseSearchFilters({
    entryType: args.entryType,
    shopQuery: args.shopQuery,
    categoryId: args.categoryId,
    minAmountYen: args.minAmountYen,
    maxAmountYen: args.maxAmountYen,
    startDate: args.startDate,
    endDate: args.endDate,
  });
  if (!parsed.ok) {
    throw new ExpenseSearchDomainError(parsed.error);
  }

  if (parsed.filters.categoryId !== undefined) {
    const categoryGroupId = await store.getCategoryGroupId(parsed.filters.categoryId);
    if (categoryGroupId !== groupId) {
      return emptySearchResult();
    }
  }

  const source = await store.loadHistoryEntries(
    groupId,
    parsed.filters.startDate,
    parsed.filters.endDate,
  );
  const groups = filterHistoryGroups(
    groupHistoryEntries(source.entries, source.incomes),
    parsed.filters,
  );

  // 前期間比較は初回ページでだけ計算する。ページ追加時は現在期間の集計を
  // 更新しつつ、初回レスポンスの比較をUI側で保持することで、同じ比較を
  // 毎ページ読み直すコストと上限超過リスクを避ける。
  const previousPeriod =
    args.paginationOpts.cursor === null
      ? calculatePreviousHistoryPeriod(parsed.filters.startDate, parsed.filters.endDate)
      : null;
  let previousGroups: SearchableHistoryGroup[] = [];
  let previousTruncated = false;
  if (previousPeriod !== null) {
    const previousSource = await store.loadHistoryEntries(
      groupId,
      previousPeriod.startDate,
      previousPeriod.endDate,
    );
    previousTruncated = previousSource.truncated;
    previousGroups = filterHistoryGroups(
      groupHistoryEntries(previousSource.entries, previousSource.incomes),
      {
        ...parsed.filters,
        startDate: previousPeriod.startDate,
        endDate: previousPeriod.endDate,
      },
    );
  }

  const categoryIds = Array.from(
    new Set([...collectCategoryIds(groups), ...collectCategoryIds(previousGroups)]),
  );
  const categoryInfoMap = await store.buildCategoryInfoMap(groupId, categoryIds);
  const aggregate = summarizeHistoryGroups(groups, categoryInfoMap);
  const paged = paginateHistoryGroups(groups, args.paginationOpts);
  const page = paged.page.flatMap((group) => mapHistoryGroupToItems(group, categoryInfoMap));
  const comparison =
    previousPeriod === null
      ? null
      : buildHistoryComparison({
          current: aggregate,
          currentStartDate: parsed.filters.startDate!,
          currentEndDate: parsed.filters.endDate!,
          previous: summarizeHistoryGroups(previousGroups, categoryInfoMap),
          previousPeriod,
        });

  return {
    page,
    continueCursor: paged.continueCursor,
    isDone: paged.isDone,
    truncated: source.truncated,
    comparisonTruncated: previousTruncated,
    matchedGroupCount: groups.length,
    totalCount: aggregate.count,
    expenseCount: aggregate.expenseCount,
    incomeCount: aggregate.incomeCount,
    totalExpenseYen: aggregate.totalExpenseYen,
    totalIncomeYen: aggregate.totalIncomeYen,
    netAmountYen: aggregate.netAmountYen,
    byCategory: aggregate.byCategory,
    trend: buildHistoryTrend(groups, parsed.filters),
    comparison,
  };
}
