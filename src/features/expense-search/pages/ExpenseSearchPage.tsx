import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { HistoryNavigation } from "../../app-shell/components/HistoryNavigation";
import { SuzumemoLoadingState } from "../../ui";
import { getCurrentWeekStartDate } from "../../week";
import { IncomeListCard } from "../../summary-shared/components/IncomeListCard";
import { ReceiptListCard } from "../../summary-shared/components/ReceiptListCard";
import { AppliedSearchFilters } from "../components/AppliedSearchFilters";
import { ExpenseSearchFilters } from "../components/ExpenseSearchFilters";
import { HistoryCategoryChart } from "../components/HistoryCategoryChart";
import { HistoryComparisonCard } from "../components/HistoryComparisonCard";
import { HistoryMetricsPanel } from "../components/HistoryMetricsPanel";
import { HistoryTrendChart } from "../components/HistoryTrendChart";
import { useExpenseSearchResults } from "../hooks/useExpenseSearchResults";
import { toIncomeItem, toReceiptItem } from "../lib/expenseSearchItems";
import {
  EMPTY_EXPENSE_SEARCH_FORM,
  expenseSearchPath,
  readExpenseSearchFormState,
  type ExpenseSearchFormState,
} from "../lib/searchParams";

export function ExpenseSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const appliedKey = searchParams.toString();
  const applied = readExpenseSearchFormState(searchParams);
  const [draftKey, setDraftKey] = useState(appliedKey);
  const [draft, setDraft] = useState<ExpenseSearchFormState>(applied);
  const userProfile = useQuery(api.users.queries.getUserProfile);
  const categoriesQuery = useQuery(api.categories.queries.listActive);
  const categories = Array.isArray(categoriesQuery) ? categoriesQuery : [];
  const {
    loadedItems,
    displayResult,
    searchError,
    isLoadingMore,
    isAdditionalSearchError,
    parsedError,
    retrySearch,
    loadMore,
  } = useExpenseSearchResults(applied, appliedKey);

  if (draftKey !== appliedKey) {
    setDraftKey(appliedKey);
    setDraft(applied);
  }

  const currentSearchPath = `${location.pathname}${location.search}`;
  const categoryName = categories.find((category) => category._id === applied.categoryId)?.name;
  const expenseItems = loadedItems.filter((item) => item.type === "expense").map(toReceiptItem);
  const incomeItems = loadedItems.filter((item) => item.type === "income").map(toIncomeItem);

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

        {parsedError !== null ? (
          <Alert severity="error" variant="outlined">
            {parsedError}
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
                  onClick={loadMore}
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
