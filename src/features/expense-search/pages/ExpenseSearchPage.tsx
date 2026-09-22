import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueries, useQuery } from "convex/react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import type {
  ExpenseSearchReceipt,
  ExpenseSearchResult,
} from "../../../../lib/convex/expenseSearch/searchExpenses";
import { HistoryNavigation } from "../../app-shell/components/HistoryNavigation";
import { SuzumemoLoadingState } from "../../ui";
import { getCurrentWeekStartDate } from "../../week";
import { IncomeListCard } from "../../summary-shared/components/IncomeListCard";
import { ReceiptListCard } from "../../summary-shared/components/ReceiptListCard";
import type { IncomeItem, ReceiptItem } from "../../summary-shared/types/types";
import { AppliedSearchFilters } from "../components/AppliedSearchFilters";
import { ExpenseSearchFilters } from "../components/ExpenseSearchFilters";
import { HistoryCategoryChart } from "../components/HistoryCategoryChart";
import { HistoryComparisonCard } from "../components/HistoryComparisonCard";
import { HistoryMetricsPanel } from "../components/HistoryMetricsPanel";
import { HistoryTrendChart } from "../components/HistoryTrendChart";
import {
  EMPTY_EXPENSE_SEARCH_FORM,
  expenseSearchPath,
  parseExpenseSearchFormState,
  readExpenseSearchFormState,
  toExpenseSearchQueryArgs,
  type ExpenseSearchFormState,
} from "../lib/searchParams";

const PAGE_SIZE = 100;

function mergeSearchPage(current: ExpenseSearchReceipt[], next: ExpenseSearchReceipt[]) {
  const itemKey = (item: ExpenseSearchReceipt) => `${item.recordType}:${item._id}`;
  const items = new Map(current.map((item) => [itemKey(item), item]));
  next.forEach((item) => items.set(itemKey(item), item));
  return Array.from(items.values());
}

function toReceiptItem(item: ExpenseSearchReceipt): ReceiptItem {
  return {
    _id: item._id,
    date: item.date,
    type: "expense",
    shopName: item.shopName,
    amountYen: item.amountYen,
    categoryId: item.categoryId ?? "",
    categoryName: item.categoryName ?? "不明",
    categoryColor: item.categoryColor ?? "#AAB7C4",
    memo: item.memo,
    recordType: item.recordType,
    itemName: item.itemName,
    receiptGroupId: item.receiptGroupId,
    receiptShopName: item.receiptShopName,
    receiptTotalAmountYen: item.receiptTotalAmountYen,
  };
}

function toIncomeItem(item: ExpenseSearchReceipt): IncomeItem {
  return {
    _id: item._id,
    date: item.date,
    type: "income",
    bankName: item.bankName,
    amountYen: item.amountYen,
    memo: item.memo,
    recordType: item.recordType,
  };
}

export function ExpenseSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const appliedKey = searchParams.toString();
  const applied = readExpenseSearchFormState(searchParams);
  const [draftKey, setDraftKey] = useState(appliedKey);
  const [draft, setDraft] = useState<ExpenseSearchFormState>(applied);
  const [loadedKey, setLoadedKey] = useState(appliedKey);
  const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
  const [loadedCursor, setLoadedCursor] = useState<string | null>(null);
  const [hasLoadedPage, setHasLoadedPage] = useState(false);
  const [loadedItems, setLoadedItems] = useState<ExpenseSearchReceipt[]>([]);
  const [lastSearchResult, setLastSearchResult] = useState<ExpenseSearchResult | null>(null);
  const [initialSearchResult, setInitialSearchResult] = useState<ExpenseSearchResult | null>(null);
  const [searchRequestId, setSearchRequestId] = useState(0);
  const userProfile = useQuery(api.users.queries.getUserProfile);
  const categoriesQuery = useQuery(api.categories.queries.listActive);
  const categories = Array.isArray(categoriesQuery) ? categoriesQuery : [];
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

  if (draftKey !== appliedKey) {
    setDraftKey(appliedKey);
    setDraft(applied);
  }

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

  const currentSearchPath = `${location.pathname}${location.search}`;
  const categoryName = categories.find((category) => category._id === applied.categoryId)?.name;
  const expenseItems = loadedItems.filter((item) => item.type === "expense").map(toReceiptItem);
  const incomeItems = loadedItems.filter((item) => item.type === "income").map(toIncomeItem);
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

  const retrySearch = () => setSearchRequestId((current) => current + 1);

  const handleApply = (next: ExpenseSearchFormState = draft) => {
    navigate(expenseSearchPath(next));
  };

  const handleFilterChange = (next: ExpenseSearchFormState) => {
    setDraft(next);
  };

  const handleAppliedFilterChange = (next: ExpenseSearchFormState) => {
    setDraft(next);
    handleApply(next);
  };

  const handleChartRangeSelect = (startDate: string, endDate: string) => {
    handleApply({ ...applied, startDate, endDate });
  };

  const handleCategorySelect = (categoryId: string) => {
    handleApply({ ...applied, categoryId, entryType: "expense" });
  };

  return (
    <Box className="app-main">
      <Stack spacing={3}>
        <HistoryNavigation
          monthlyPath={`/months/${getCurrentMonth()}`}
          searchPath={currentSearchPath}
          weeklyPath={`/weeks/${getCurrentWeekStartDate(userProfile?.weeklyStartDay)}`}
        />
        <Typography component="h1" variant="h4">
          履歴検索
        </Typography>
        <ExpenseSearchFilters
          categories={categories}
          state={draft}
          weekStartDay={userProfile?.weeklyStartDay}
          onChange={handleFilterChange}
          onClear={() => {
            setDraft(EMPTY_EXPENSE_SEARCH_FORM);
            handleApply(EMPTY_EXPENSE_SEARCH_FORM);
          }}
          onSubmit={() => handleApply(draft)}
        />
        <AppliedSearchFilters
          categoryName={categoryName}
          state={applied}
          onChange={handleAppliedFilterChange}
        />

        {!parsed.ok ? (
          <Alert severity="error" variant="outlined">
            {parsed.error}
          </Alert>
        ) : displayResult === null && searchError !== null ? (
          <Alert
            action={
              <Button color="inherit" onClick={retrySearch} size="small">
                再試行
              </Button>
            }
            severity="error"
            variant="outlined"
          >
            履歴検索に失敗しました。時間をおいてもう一度お試しください。
          </Alert>
        ) : displayResult === null ? (
          <SuzumemoLoadingState
            label="履歴検索結果を読み込み中"
            message="支出と収入を検索しています…"
            variant="page"
          />
        ) : (
          <>
            {searchError !== null ? (
              <Alert
                action={
                  <Button color="inherit" onClick={retrySearch} size="small">
                    {isAdditionalSearchError ? "もう一度読み込む" : "再試行"}
                  </Button>
                }
                severity="error"
                variant="outlined"
              >
                {isAdditionalSearchError
                  ? "追加の履歴を読み込めませんでした。表示済みの履歴はそのまま残しています。"
                  : "履歴検索に失敗しました。時間をおいてもう一度お試しください。"}
              </Alert>
            ) : null}
            {displayResult.truncated ? (
              <Alert severity="warning" variant="outlined">
                件数が多いため、先頭の一部だけを集計しています。期間やキーワードで絞り込んでください。
              </Alert>
            ) : null}
            {displayResult.comparisonTruncated ? (
              <Alert severity="info" variant="outlined">
                前期間比較はデータ量が多いため、一部の履歴をもとに計算しています。
              </Alert>
            ) : null}
            <HistoryMetricsPanel
              expenseCount={displayResult.expenseCount}
              incomeCount={displayResult.incomeCount}
              netAmountYen={displayResult.netAmountYen}
              totalCount={displayResult.totalCount}
              totalExpenseYen={displayResult.totalExpenseYen}
              totalIncomeYen={displayResult.totalIncomeYen}
            />
            <HistoryTrendChart
              points={displayResult.trend}
              onPointSelect={(point) => handleChartRangeSelect(point.startDate, point.endDate)}
            />
            <HistoryCategoryChart
              categories={displayResult.byCategory}
              onCategorySelect={handleCategorySelect}
            />
            <HistoryComparisonCard
              comparison={displayResult.comparison}
              onCategorySelect={handleCategorySelect}
            />
            {expenseItems.length === 0 && incomeItems.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                条件に合う履歴はありません
              </Typography>
            ) : (
              <>
                {applied.entryType !== "income" && expenseItems.length > 0 ? (
                  <ReceiptListCard
                    count={expenseItems.length}
                    emptyMessage="条件に合う支出はありません"
                    heading={`支出（${displayResult.expenseCount}グループ）`}
                    isLoading={false}
                    listAriaLabel="支出の検索結果"
                    maxVisibleGroups={Number.POSITIVE_INFINITY}
                    receipts={expenseItems}
                  />
                ) : null}
                {applied.entryType !== "expense" && incomeItems.length > 0 ? (
                  <IncomeListCard
                    count={incomeItems.length}
                    emptyMessage="条件に合う収入はありません"
                    incomes={incomeItems}
                    isLoading={false}
                    listAriaLabel="収入の検索結果"
                  />
                ) : null}
              </>
            )}
            {!displayResult.isDone && searchError === null ? (
              <>
                {isLoadingMore ? (
                  <Alert severity="info" variant="outlined">
                    追加の履歴を読み込み中…
                  </Alert>
                ) : null}
                <Button
                  disabled={isLoadingMore}
                  onClick={() => setPaginationCursor(displayResult.continueCursor)}
                  sx={{ alignSelf: "center", minHeight: 44 }}
                  variant="outlined"
                >
                  {isLoadingMore ? "読み込み中…" : "さらに読み込む"}
                </Button>
              </>
            ) : null}
          </>
        )}
      </Stack>
    </Box>
  );
}
