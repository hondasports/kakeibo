import {
  buildHistoryComparison,
  buildHistoryTrend,
  calculatePreviousHistoryPeriod,
  summarizeHistoryGroups,
} from "../../domain/expenseSearch/analytics";
import {
  DEFAULT_HISTORY_SORT_ORDER,
  filterHistoryGroups,
  groupHistoryEntries,
  paginateHistoryGroups,
  parseExpenseSearchFilters,
  UNCATEGORIZED_CATEGORY_ID,
  type HistoryEntryType,
  type HistorySortOrder,
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
    order?: "asc" | "desc",
  ) => Promise<SearchHistorySource>;
  buildCategoryInfoMap: (
    groupId: string,
    categoryIds: string[],
  ) => Promise<Map<string, { name: string; color: string }>>;
};

type SearchExpensesInput = {
  entryType?: HistoryEntryType;
  sortOrder?: HistorySortOrder;
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
    sortOrder: args.sortOrder,
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

  if (
    parsed.filters.categoryId !== undefined &&
    parsed.filters.categoryId !== UNCATEGORIZED_CATEGORY_ID
  ) {
    const categoryGroupId = await store.getCategoryGroupId(parsed.filters.categoryId);
    if (categoryGroupId !== groupId) {
      return emptySearchResult();
    }
  }

  // dateAsc は古い側から取る（打ち切られても表示順の先頭側が残る）。
  // dateDesc/amountDesc は新しい側から取る（amountDesc は範囲内での金額順になる旨UIで案内する）。
  const source = await store.loadHistoryEntries(
    groupId,
    parsed.filters.startDate,
    parsed.filters.endDate,
    parsed.filters.sortOrder === "dateAsc" ? "asc" : "desc",
  );
  const groups = filterHistoryGroups(
    groupHistoryEntries(source.entries, source.incomes),
    parsed.filters,
  );

  // 集計は並び順に依存しない。常に日付が新しい側の範囲を対象にする。
  // dateAsc で打ち切られた場合、一覧用の古い側データは集計範囲と異なる
  // ため新しい側を読み直す（未打ち切りなら全件読めており再読は不要）。
  let aggregateGroups = groups;
  if (source.truncated && parsed.filters.sortOrder === "dateAsc") {
    const aggregateSource = await store.loadHistoryEntries(
      groupId,
      parsed.filters.startDate,
      parsed.filters.endDate,
      "desc",
    );
    aggregateGroups = filterHistoryGroups(
      groupHistoryEntries(aggregateSource.entries, aggregateSource.incomes),
      parsed.filters,
    );
  }

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
    // 前期間比較も集計と同じく並び順に依存せず、常に新しい側の範囲を読む。
    const previousSource = await store.loadHistoryEntries(
      groupId,
      previousPeriod.startDate,
      previousPeriod.endDate,
      "desc",
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
    new Set([
      ...collectCategoryIds(groups),
      ...collectCategoryIds(aggregateGroups),
      ...collectCategoryIds(previousGroups),
    ]),
  );
  const categoryInfoMap = await store.buildCategoryInfoMap(groupId, categoryIds);
  const aggregate = summarizeHistoryGroups(aggregateGroups, categoryInfoMap);
  const paged = paginateHistoryGroups(
    groups,
    args.paginationOpts,
    parsed.filters.sortOrder ?? DEFAULT_HISTORY_SORT_ORDER,
  );
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
    matchedGroupCount: aggregateGroups.length,
    totalCount: aggregate.count,
    expenseCount: aggregate.expenseCount,
    incomeCount: aggregate.incomeCount,
    totalExpenseYen: aggregate.totalExpenseYen,
    totalIncomeYen: aggregate.totalIncomeYen,
    netAmountYen: aggregate.netAmountYen,
    byCategory: aggregate.byCategory,
    trend: buildHistoryTrend(aggregateGroups, parsed.filters),
    comparison,
  };
}
