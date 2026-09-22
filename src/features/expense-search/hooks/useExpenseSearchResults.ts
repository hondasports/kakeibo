import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useQueries } from "convex/react";
import type {
  ExpenseSearchReceipt,
  ExpenseSearchResult,
} from "../../../../lib/convex/expenseSearch/searchExpenses";
import {
  parseExpenseSearchFormState,
  toExpenseSearchQueryArgs,
  type ExpenseSearchFormState,
} from "../lib/searchParams";
import { mergeSearchPage } from "../lib/expenseSearchItems";

const PAGE_SIZE = 100;

export function useExpenseSearchResults(applied: ExpenseSearchFormState, appliedKey: string) {
  const [loadedKey, setLoadedKey] = useState(appliedKey);
  const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
  const [loadedCursor, setLoadedCursor] = useState<string | null>(null);
  const [hasLoadedPage, setHasLoadedPage] = useState(false);
  const [loadedItems, setLoadedItems] = useState<ExpenseSearchReceipt[]>([]);
  const [lastSearchResult, setLastSearchResult] = useState<ExpenseSearchResult | null>(null);
  const [initialSearchResult, setInitialSearchResult] = useState<ExpenseSearchResult | null>(null);
  const [searchRequestId, setSearchRequestId] = useState(0);
  const parsed = parseExpenseSearchFormState(applied);
  const queryArgs = toExpenseSearchQueryArgs(applied);
  const activeCursor = loadedKey === appliedKey ? paginationCursor : null;
  const searchQueryKey = `historySearch:${searchRequestId}`;
  const searchEntryType = queryArgs.ok ? queryArgs.args.entryType : undefined;
  const searchShopQuery = queryArgs.ok ? queryArgs.args.shopQuery : undefined;
  const searchCategoryId = queryArgs.ok ? queryArgs.args.categoryId : undefined;
  const searchMinAmountYen = queryArgs.ok ? queryArgs.args.minAmountYen : undefined;
  const searchMaxAmountYen = queryArgs.ok ? queryArgs.args.maxAmountYen : undefined;
  const searchStartDate = queryArgs.ok ? queryArgs.args.startDate : undefined;
  const searchEndDate = queryArgs.ok ? queryArgs.args.endDate : undefined;
  const searchQueryArgs = useMemo(() => {
    if (!queryArgs.ok) {
      return null;
    }
    return {
      paginationOpts: { numItems: PAGE_SIZE, cursor: activeCursor },
      ...(searchEntryType !== undefined ? { entryType: searchEntryType } : {}),
      ...(searchShopQuery !== undefined ? { shopQuery: searchShopQuery } : {}),
      ...(searchCategoryId !== undefined ? { categoryId: searchCategoryId } : {}),
      ...(searchMinAmountYen !== undefined ? { minAmountYen: searchMinAmountYen } : {}),
      ...(searchMaxAmountYen !== undefined ? { maxAmountYen: searchMaxAmountYen } : {}),
      ...(searchStartDate !== undefined ? { startDate: searchStartDate } : {}),
      ...(searchEndDate !== undefined ? { endDate: searchEndDate } : {}),
    };
  }, [
    activeCursor,
    queryArgs.ok,
    searchCategoryId,
    searchEndDate,
    searchEntryType,
    searchMaxAmountYen,
    searchMinAmountYen,
    searchShopQuery,
    searchStartDate,
  ]);
  const searchQueries = useMemo(
    () =>
      searchQueryArgs === null
        ? {}
        : {
            [searchQueryKey]: {
              query: api.expenseSearch.searchExpenses,
              args: searchQueryArgs,
            },
          },
    [searchQueryArgs, searchQueryKey],
  );
  const searchQueryResults = useQueries(searchQueries);
  const searchQueryValue = searchQueryResults[searchQueryKey] as
    | ExpenseSearchResult
    | Error
    | undefined;
  const searchResult = searchQueryValue instanceof Error ? undefined : searchQueryValue;
  const searchError = searchQueryValue instanceof Error ? searchQueryValue : null;

  if (loadedKey !== appliedKey) {
    setLoadedKey(appliedKey);
    setPaginationCursor(null);
    setLoadedCursor(null);
    setHasLoadedPage(false);
    setLoadedItems([]);
    setLastSearchResult(null);
    setInitialSearchResult(null);
  }

  if (
    searchResult !== undefined &&
    loadedKey === appliedKey &&
    !(activeCursor === null && hasLoadedPage) &&
    !(
      activeCursor !== null &&
      (loadedCursor === activeCursor || searchResult.continueCursor === activeCursor)
    )
  ) {
    setHasLoadedPage(true);
    setLoadedItems((current) =>
      activeCursor === null ? searchResult.page : mergeSearchPage(current, searchResult.page),
    );
    setLoadedCursor(activeCursor);
    setLastSearchResult(searchResult);
    if (activeCursor === null) {
      setInitialSearchResult(searchResult);
    }
  }

  const currentDisplayResult = searchResult ?? lastSearchResult;
  const displayResult =
    loadedKey !== appliedKey || currentDisplayResult === null
      ? null
      : activeCursor !== null && initialSearchResult !== null
        ? {
            ...currentDisplayResult,
            comparison: initialSearchResult.comparison,
            comparisonTruncated: initialSearchResult.comparisonTruncated,
          }
        : currentDisplayResult;
  const isLoadingMore =
    loadedKey === appliedKey &&
    paginationCursor !== null &&
    paginationCursor !== loadedCursor &&
    searchError === null;
  const isAdditionalSearchError = searchError !== null && activeCursor !== null;

  return {
    loadedItems,
    displayResult,
    searchError,
    isLoadingMore,
    isAdditionalSearchError,
    parsedError: parsed.ok ? null : parsed.error,
    retrySearch: () => setSearchRequestId((current) => current + 1),
    loadMore: () => setPaginationCursor(displayResult?.continueCursor ?? null),
  };
}
