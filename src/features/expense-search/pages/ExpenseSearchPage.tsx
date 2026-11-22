import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { UNCATEGORIZED_CATEGORY_ID } from "../../../../lib/domain/expenseSearch/filter";
import { HistoryNavigation } from "../../app-shell/components/HistoryNavigation";
import { SuzumemoLoadingState } from "../../ui";
import { getCurrentWeekStartDate, normalizeWeekStartDate } from "../../week";
import { IncomeListCard } from "../../summary-shared/components/IncomeListCard";
import { ReceiptListCard } from "../../summary-shared/components/ReceiptListCard";
import { ExpenseBulkCategoryDialog } from "../../summary-shared/components/ExpenseBulkCategoryDialog";
import { ExpenseBulkDeleteDialog } from "../../summary-shared/components/ExpenseBulkDeleteDialog";
import { ExpenseEntryDeleteDialog } from "../../summary-shared/components/ExpenseEntryDeleteDialog";
import { ExpenseEntryEditDialog } from "../../summary-shared/components/ExpenseEntryEditDialog";
import type { CategoryPreview } from "../../summary-shared/components/ReceiptRow";
import { useSpendingBulkSelection } from "../../summary-shared/hooks/useSpendingBulkSelection";
import {
  groupReceiptItems,
  incomeItemToReceiptItem,
  type ReceiptItem,
} from "../../summary-shared/types/types";
import { AppliedSearchFilters } from "../components/AppliedSearchFilters";
import { ExpenseSearchFilters } from "../components/ExpenseSearchFilters";
import { HistoryCategoryChart } from "../components/HistoryCategoryChart";
import { HistoryComparisonCard } from "../components/HistoryComparisonCard";
import { HistoryMetricsPanel } from "../components/HistoryMetricsPanel";
import { HistoryTrendChart } from "../components/HistoryTrendChart";
import { useExpenseSearchResults } from "../hooks/useExpenseSearchResults";
import { toIncomeItem, toReceiptItem } from "../lib/expenseSearchItems";
import { formatDateForDisplay } from "../../../utils/date";
import {
  diffExpenseSearchFormState,
  EMPTY_EXPENSE_SEARCH_FORM,
  expenseSearchPath,
  readExpenseSearchFormState,
  validateExpenseSearchForm,
  type ExpenseSearchFormState,
} from "../lib/searchParams";

function formatSearchPeriodLabel(state: ExpenseSearchFormState): string {
  const start = state.startDate ? formatDateForDisplay(state.startDate) : null;
  const end = state.endDate ? formatDateForDisplay(state.endDate) : null;
  if (start !== null && end !== null) {
    return `${start}〜${end}`;
  }
  if (start !== null) {
    return `${start}以降`;
  }
  if (end !== null) {
    return `${end}まで`;
  }
  return "全期間";
}

function hasAnyFilter(state: ExpenseSearchFormState): boolean {
  return (
    state.entryType !== "all" ||
    [
      state.shopQuery,
      state.categoryId,
      state.minAmountYen,
      state.maxAmountYen,
      state.startDate,
      state.endDate,
    ].some((value) => value.length > 0)
  );
}

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
  // チップ表示用に無効化済みを含むカテゴリを引く。未指定のときは発行しない。
  const allCategoriesQuery = useQuery(
    api.categories.queries.listForSettings,
    applied.categoryId ? {} : "skip",
  );
  const allCategories = Array.isArray(allCategoriesQuery) ? allCategoriesQuery : [];
  const {
    loadedItems,
    displayResult,
    searchError,
    isLoadingMore,
    isAdditionalSearchError,
    retrySearch,
    loadMore,
    refreshResults,
  } = useExpenseSearchResults(applied, appliedKey);

  const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<CategoryPreview | null>(null);

  const deleteExpenseEntry = useMutation(api.expenseEntries.mutations.deleteExpenseEntry);
  const deleteReceipt = useMutation(api.receipts.crud.deleteReceipt);
  const bulkUpdateSpendingCategories = useMutation(
    api.expenseEntries.mutations.bulkUpdateSpendingCategories,
  );
  const bulkDeleteSpendingRecords = useMutation(
    api.expenseEntries.mutations.bulkDeleteSpendingRecords,
  );

  // チップ削除・グラフクリックなど適用側の変化は差分だけdraftへ反映し、
  // フォームで編集中の未適用の値は消さない。
  if (draftKey !== appliedKey) {
    const previousApplied = readExpenseSearchFormState(new URLSearchParams(draftKey));
    const delta = diffExpenseSearchFormState(previousApplied, applied);
    setDraft((current) => ({ ...current, ...delta }));
    setDraftKey(appliedKey);
  }

  const draftValidation = validateExpenseSearchForm(draft);
  const appliedValidation = validateExpenseSearchForm(applied);
  const hasUnappliedChanges = Object.keys(diffExpenseSearchFormState(applied, draft)).length > 0;

  const currentSearchPath = `${location.pathname}${location.search}`;
  const appliedCategory = allCategories.find((category) => category._id === applied.categoryId);
  const categoryLabel =
    applied.categoryId === UNCATEGORIZED_CATEGORY_ID
      ? "未分類"
      : appliedCategory
        ? appliedCategory.isActive
          ? appliedCategory.name
          : `${appliedCategory.name}（無効化済み）`
        : undefined;

  // 期間が複数月にまたがるときは開始日側の月・週を代表として使う。
  const representativeDate =
    applied.startDate.length > 0
      ? applied.startDate
      : applied.endDate.length > 0
        ? applied.endDate
        : undefined;
  const linkedWeekStart =
    representativeDate !== undefined
      ? normalizeWeekStartDate(representativeDate, userProfile?.weeklyStartDay)
      : null;
  const monthlyPath =
    representativeDate !== undefined
      ? `/months/${representativeDate.slice(0, 7)}`
      : `/months/${getCurrentMonth()}`;
  const weeklyPath =
    linkedWeekStart !== null && linkedWeekStart !== undefined
      ? `/weeks/${linkedWeekStart}`
      : `/weeks/${getCurrentWeekStartDate(userProfile?.weeklyStartDay)}`;

  const expenseItems = useMemo(
    () => loadedItems.filter((item) => item.type === "expense").map(toReceiptItem),
    [loadedItems],
  );
  const incomeItems = useMemo(
    () => loadedItems.filter((item) => item.type === "income").map(toIncomeItem),
    [loadedItems],
  );

  const weeklyStartDay = userProfile?.weeklyStartDay ?? 1;
  // 適用条件が変わると表示対象が変わるため、選択状態は適用条件単位で持つ。
  const bulkSelection = useSpendingBulkSelection(expenseItems, appliedKey);
  const weekSummaryPath = (date: string) =>
    `/weeks/${normalizeWeekStartDate(date, weeklyStartDay) ?? date}`;

  const handleConfirmDelete = async () => {
    if (!deletingReceipt) {
      return;
    }
    setDeleteSaving(true);
    setDeleteError("");
    try {
      if (deletingReceipt.recordType === "expenseEntry") {
        await deleteExpenseEntry({
          expenseEntryId: deletingReceipt._id as Id<"expenseEntries">,
        });
      } else {
        await deleteReceipt({
          receiptId: deletingReceipt._id as Id<"receipts">,
        });
      }
      setDeletingReceipt(null);
      setSaveMessage("記録を削除しました。");
      refreshResults();
    } catch {
      setDeleteError("削除に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setDeleteSaving(false);
    }
  };

  const handleBulkChangeCategory = async (categoryId: string) => {
    setBulkSaving(true);
    setDeleteError("");
    try {
      const result = await bulkUpdateSpendingCategories({
        expenseEntryIds: bulkSelection.selectedIds.expenseEntryIds as Id<"expenseEntries">[],
        receiptIds: bulkSelection.selectedIds.receiptIds as Id<"receipts">[],
        categoryId: categoryId as Id<"categories">,
      });
      setBulkCategoryOpen(false);
      setPreviewCategory(null);
      bulkSelection.clearSelection();
      setSaveMessage(`明細${result.updatedCount}件のカテゴリを変更しました。`);
      refreshResults();
    } catch {
      setDeleteError("カテゴリの一括変更に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkSaving(true);
    setDeleteError("");
    try {
      const result = await bulkDeleteSpendingRecords({
        expenseEntryIds: bulkSelection.selectedIds.expenseEntryIds as Id<"expenseEntries">[],
        receiptIds: bulkSelection.selectedIds.receiptIds as Id<"receipts">[],
      });
      setBulkDeleteOpen(false);
      bulkSelection.clearSelection();
      setSaveMessage(`明細${result.deletedCount}件を削除しました。`);
      refreshResults();
    } catch {
      setDeleteError("一括削除に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBulkSaving(false);
    }
  };

  const handleApply = (next: ExpenseSearchFormState = draft) => {
    navigate(expenseSearchPath(next));
  };

  const handleFilterChange = (next: ExpenseSearchFormState) => {
    setDraft(next);
  };

  const handleSubmit = () => {
    if (!draftValidation.ok) {
      return;
    }
    handleApply(draft);
  };

  const handleClearAll = () => {
    setDraft(EMPTY_EXPENSE_SEARCH_FORM);
    handleApply(EMPTY_EXPENSE_SEARCH_FORM);
  };

  const handleAppliedFilterChange = (next: ExpenseSearchFormState) => {
    handleApply(next);
  };

  const handleChartRangeSelect = (startDate: string, endDate: string) => {
    handleApply({ ...applied, startDate, endDate });
  };

  const handleCategorySelect = (categoryId: string) => {
    handleApply({
      ...applied,
      // 集計側は未分類を空文字で返すため、フィルタ用のセンチネル値へ写像する
      categoryId: categoryId === "" ? UNCATEGORIZED_CATEGORY_ID : categoryId,
      entryType: "expense",
    });
  };

  // expenseCountはレシート単位の件数なので、表示側も明細ではなくレシートの件数で合わせる
  const displayedExpenseGroupCount = useMemo(
    () => groupReceiptItems(expenseItems).length,
    [expenseItems],
  );
  const expenseListHeading =
    displayResult !== null && displayResult.truncated
      ? `支出一覧（集計対象の一部 ${displayResult.expenseCount}件中 ${displayedExpenseGroupCount}件を表示）`
      : displayResult !== null && !displayResult.isDone
        ? `支出一覧（${displayResult.expenseCount}件中 ${displayedExpenseGroupCount}件を表示）`
        : `支出一覧（${displayedExpenseGroupCount}件）`;

  return (
    <Box className="app-main">
      <Stack spacing={3}>
        <HistoryNavigation
          monthlyPath={monthlyPath}
          searchPath={currentSearchPath}
          weeklyPath={weeklyPath}
        />
        <Typography component="h1" variant="h4">
          履歴検索
        </Typography>
        <ExpenseSearchFilters
          categories={categories}
          errors={draftValidation.fieldErrors}
          hasUnappliedChanges={hasUnappliedChanges}
          state={draft}
          weekStartDay={userProfile?.weeklyStartDay}
          onChange={handleFilterChange}
          onClear={handleClearAll}
          onSubmit={handleSubmit}
        />
        <AppliedSearchFilters
          categoryLabel={categoryLabel}
          state={applied}
          onChange={handleAppliedFilterChange}
        />

        {appliedValidation.formError !== null ? (
          <Alert severity="error" variant="outlined">
            {appliedValidation.formError}
          </Alert>
        ) : !appliedValidation.ok ? (
          <Alert severity="error" variant="outlined">
            {Array.from(new Set(Object.values(appliedValidation.fieldErrors))).join("、")}
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
                {applied.sortOrder === "amountDesc"
                  ? "件数が多いため、新しい10,000件の中での金額順です。集計もこの範囲が対象です。期間を絞ると全件から並べます。"
                  : applied.sortOrder === "dateAsc"
                    ? "件数が多いため、一覧は古い10,000件を表示しています。集計は新しい10,000件が対象です。期間を絞ると全件から並べます。"
                    : "件数が多いため、新しい10,000件を対象に集計・表示しています。期間やキーワードで絞り込んでください。"}
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
              periodLabel={formatSearchPeriodLabel(applied)}
              totalCount={displayResult.totalCount}
              totalExpenseYen={displayResult.totalExpenseYen}
              totalIncomeYen={displayResult.totalIncomeYen}
              truncated={displayResult.truncated}
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
              <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
                <Typography color="text.secondary" variant="body2">
                  条件に合う履歴はありません
                </Typography>
                {hasAnyFilter(applied) ? (
                  <Button onClick={handleClearAll} sx={{ minHeight: 44 }} variant="outlined">
                    条件をすべてクリア
                  </Button>
                ) : null}
              </Stack>
            ) : (
              <>
                {applied.entryType !== "income" && expenseItems.length > 0 ? (
                  <ReceiptListCard
                    count={expenseItems.length}
                    dateFormat="yearMonthDay"
                    emptyMessage="条件に合う支出はありません"
                    heading={expenseListHeading}
                    isLoading={false}
                    listAriaLabel="支出の検索結果"
                    maxVisibleGroups={Number.POSITIVE_INFINITY}
                    preserveOrder
                    receipts={expenseItems}
                    onDeleteReceipt={setDeletingReceipt}
                    onEditReceipt={setEditingReceipt}
                    isSelected={bulkSelection.isSelected}
                    limitMessage={bulkSelection.limitMessage}
                    previewCategory={previewCategory}
                    saving={bulkSaving}
                    selectedCount={bulkSelection.selectedCount}
                    selectionEnabled
                    onBulkChangeCategory={() => setBulkCategoryOpen(true)}
                    onBulkDelete={() => setBulkDeleteOpen(true)}
                    onClearSelection={bulkSelection.clearSelection}
                    onDeselectVisible={bulkSelection.deselectVisible}
                    onSelectVisible={bulkSelection.selectVisible}
                    onToggleSelection={bulkSaving ? undefined : bulkSelection.toggleReceipt}
                    weekSummaryPath={weekSummaryPath}
                  />
                ) : null}
                {applied.entryType !== "expense" && incomeItems.length > 0 ? (
                  <IncomeListCard
                    count={incomeItems.length}
                    dateFormat="yearMonthDay"
                    emptyMessage="条件に合う収入はありません"
                    incomes={incomeItems}
                    isLoading={false}
                    listAriaLabel="収入の検索結果"
                    preserveOrder
                    onDeleteIncome={(income) => setDeletingReceipt(incomeItemToReceiptItem(income))}
                    onEditIncome={(income) => setEditingReceipt(incomeItemToReceiptItem(income))}
                    weekSummaryPath={weekSummaryPath}
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

        {deleteError ? (
          <Alert severity="error" variant="outlined" onClose={() => setDeleteError("")}>
            {deleteError}
          </Alert>
        ) : null}

        <ExpenseEntryEditDialog
          categories={categories}
          open={editingReceipt !== null}
          receipt={editingReceipt}
          onClose={() => setEditingReceipt(null)}
          onSaved={() => {
            setSaveMessage("変更を保存しました。");
            refreshResults();
          }}
        />

        <ExpenseEntryDeleteDialog
          open={deletingReceipt !== null}
          saving={deleteSaving}
          onCancel={() => setDeletingReceipt(null)}
          onConfirm={() => void handleConfirmDelete()}
        />

        <ExpenseBulkCategoryDialog
          categories={categories}
          open={bulkCategoryOpen}
          saving={bulkSaving}
          selectedReceipts={bulkSelection.selectedReceipts}
          onCancel={() => {
            setBulkCategoryOpen(false);
            setPreviewCategory(null);
          }}
          onConfirm={(categoryId) => void handleBulkChangeCategory(categoryId)}
          onPreviewCategory={setPreviewCategory}
        />

        <ExpenseBulkDeleteDialog
          open={bulkDeleteOpen}
          saving={bulkSaving}
          selectedCount={bulkSelection.selectedCount}
          onCancel={() => setBulkDeleteOpen(false)}
          onConfirm={() => void handleBulkDelete()}
        />

        <Snackbar
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          autoHideDuration={3000}
          message={saveMessage}
          onClose={() => setSaveMessage("")}
          open={saveMessage.length > 0}
        />
      </Stack>
    </Box>
  );
}
