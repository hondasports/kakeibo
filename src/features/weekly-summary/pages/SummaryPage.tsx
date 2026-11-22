import { api } from "../../../../convex/_generated/api";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatYearLabel } from "../../../../lib/domain/common/year";
import { WeekNavigator } from "../../week";
import { HistoryNavigation } from "../../app-shell/components/HistoryNavigation";
import { SummarySectionErrorBoundary } from "../../summary-shared/components/SummarySectionErrorBoundary";
import { WeeklySummaryPanel } from "../components/WeeklySummaryPanel";
import { receiptItemToEntryPrefill } from "../../summary-shared/lib/receiptToEntryPrefill";
import { ExpenseBulkCategoryDialog } from "../../summary-shared/components/ExpenseBulkCategoryDialog";
import { ExpenseBulkDeleteDialog } from "../../summary-shared/components/ExpenseBulkDeleteDialog";
import { ExpenseEntryDeleteDialog } from "../../summary-shared/components/ExpenseEntryDeleteDialog";
import { ExpenseEntryEditDialog } from "../../summary-shared/components/ExpenseEntryEditDialog";
import type { CategoryPreview } from "../../summary-shared/components/ReceiptRow";
import { useWeeklyBulkSelection } from "../hooks/useWeeklyBulkSelection";
import { buildWeeklyExpenseChartData } from "../utils/weeklyExpenseChartData";
import { SuzumemoLoadingState } from "../../ui";
import type { ReceiptItem } from "../../summary-shared/types/types";
import {
  addWeeks,
  getCurrentWeekStartDate,
  getWeekEndDate,
  isFutureWeek,
  normalizeWeekStartDate,
} from "../../week";

const EMPTY_RECEIPTS: ReceiptItem[] = [];

type WeeklySummarySectionProps = {
  currentWeekStartDate: string;
  weekStartDate: string;
  onRetry: () => void;
};

function WeeklySummarySection({
  currentWeekStartDate,
  weekStartDate,
  onRetry,
}: WeeklySummarySectionProps) {
  const navigate = useNavigate();
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

  const weeklySummary = useQuery(api.receipts.summaries.getWeekSummaryWithCategories, {
    weekStartDate,
  });
  const categoriesResult = useQuery_experimental({
    query: api.categories.queries.listActive,
    args: {},
  });
  const categories =
    categoriesResult.status === "success" && Array.isArray(categoriesResult.data)
      ? categoriesResult.data
      : [];

  const fourWeeksResult = useQuery_experimental({
    query: api.receipts.summaries.getFourWeeksSummary,
    args: { weekStartDate },
  });
  const fourWeeksSummary = fourWeeksResult.status === "success" ? fourWeeksResult.data : undefined;
  const weeklyExpenseTrend =
    fourWeeksSummary != null && Array.isArray(fourWeeksSummary.weeks)
      ? buildWeeklyExpenseChartData({
          weeks: fourWeeksSummary.weeks,
          targetWeekStartDate: weekStartDate,
          currentWeekStartDate,
        })
      : undefined;

  const receipts =
    weeklySummary && Array.isArray(weeklySummary.receipts)
      ? weeklySummary.receipts
      : EMPTY_RECEIPTS;
  const bulkSelection = useWeeklyBulkSelection(receipts, weekStartDate);

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
    } catch {
      setDeleteError("一括削除に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBulkSaving(false);
    }
  };

  if (weeklySummary === undefined) {
    return (
      <SuzumemoLoadingState
        label="データを読み込み中"
        message="週次サマリーを読み込んでいます…"
        variant="page"
      />
    );
  }

  if (weeklySummary === null) {
    return (
      <Alert severity="error" variant="outlined">
        週次サマリーの読み込みに失敗しました。
      </Alert>
    );
  }

  return (
    <>
      {categoriesResult.status === "error" && (
        <Stack spacing={1.5}>
          <Alert severity="error" variant="outlined">
            カテゴリを読み込めませんでした。カテゴリの変更はできません。
          </Alert>
          <Button onClick={onRetry} sx={{ alignSelf: "flex-start" }} variant="outlined">
            再試行
          </Button>
        </Stack>
      )}
      {deleteError && (
        <Alert severity="error" variant="outlined" onClose={() => setDeleteError("")}>
          {deleteError}
        </Alert>
      )}

      <WeeklySummaryPanel
        count={weeklySummary.count}
        totalAmountYen={weeklySummary.totalAmountYen}
        totalIncomeYen={weeklySummary.totalIncomeYen}
        incomeCount={weeklySummary.incomeCount}
        byCategory={weeklySummary.byCategory}
        prevWeekTotalAmountYen={weeklySummary.prevWeekTotalAmountYen ?? null}
        receipts={weeklySummary.receipts}
        incomes={weeklySummary.incomes}
        isLoading={false}
        weekStartDate={weekStartDate}
        weeklyExpenseTrend={weeklyExpenseTrend}
        fourWeeksStatus={fourWeeksResult.status}
        onTrendRetry={onRetry}
        onCopyReceipt={(receipt) =>
          navigate("/weeks/current/input", {
            state: { prefill: receiptItemToEntryPrefill(receipt) },
          })
        }
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
      />

      <ExpenseEntryEditDialog
        categories={categories}
        open={editingReceipt !== null}
        receipt={editingReceipt}
        onClose={() => setEditingReceipt(null)}
        onSaved={() => setSaveMessage("変更を保存しました。")}
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
    </>
  );
}

export function SummaryPage() {
  const { weekStartDate: rawWeekStartDate } = useParams<{ weekStartDate: string }>();
  const navigate = useNavigate();
  const [sectionRetryKey, setSectionRetryKey] = useState(0);

  const userProfileResult = useQuery_experimental({
    query: api.users.queries.getUserProfile,
    args: {},
  });
  const userProfile = userProfileResult.status === "success" ? userProfileResult.data : undefined;

  const weeklyStartDay = userProfile?.weeklyStartDay ?? 1;
  const currentWeekStartDate = getCurrentWeekStartDate(weeklyStartDay);

  const normalized = rawWeekStartDate
    ? normalizeWeekStartDate(rawWeekStartDate, weeklyStartDay)
    : null;
  const weekStartDate =
    normalized !== null && !isFutureWeek(normalized, currentWeekStartDate)
      ? normalized
      : currentWeekStartDate;

  const weekEndDate = getWeekEndDate(weekStartDate);
  const isCurrentWeek = weekStartDate === currentWeekStartDate;
  const summaryMonth = weekStartDate.slice(0, 7);
  const summaryYear = weekStartDate.slice(0, 4);
  const historyNavigation = (
    <HistoryNavigation
      monthlyPath={`/months/${summaryMonth}`}
      searchPath="/search"
      weeklyPath={`/weeks/${weekStartDate}`}
    />
  );

  const profileReady = userProfileResult.status !== "pending";

  useEffect(() => {
    if (profileReady && rawWeekStartDate && weekStartDate !== rawWeekStartDate) {
      navigate(`/weeks/${weekStartDate}`, { replace: true });
    }
  }, [rawWeekStartDate, profileReady, weekStartDate, navigate]);

  const navigateToWeek = (newWeekStartDate: string) => {
    const norm = normalizeWeekStartDate(newWeekStartDate, weeklyStartDay) ?? currentWeekStartDate;
    const target = isFutureWeek(norm, currentWeekStartDate) ? currentWeekStartDate : norm;
    navigate(`/weeks/${target}`);
  };

  if (!profileReady) {
    return (
      <Box className="app-main">
        <Stack spacing={3}>
          {historyNavigation}
          <SuzumemoLoadingState
            label="データを読み込み中"
            message="週次サマリーを読み込んでいます…"
            variant="page"
          />
        </Stack>
      </Box>
    );
  }

  return (
    <Box className="app-main">
      <Stack spacing={3}>
        {historyNavigation}
        <Stack className="weekly-summary-header" direction="row">
          <Box
            alt=""
            className="weekly-summary-header-icon"
            component="img"
            height={32}
            src="/suzumemo-app-icon.svg"
            width={32}
          />
          <Typography component="h1" variant="h4">
            週次サマリー
          </Typography>
        </Stack>

        <WeekNavigator
          compactOnMobile
          weekStartDate={weekStartDate}
          weekEndDate={weekEndDate}
          isCurrentWeek={isCurrentWeek}
          onPreviousWeek={() => navigateToWeek(addWeeks(weekStartDate, -1))}
          onNextWeek={() => navigateToWeek(addWeeks(weekStartDate, 1))}
        />

        <Button
          component={Link}
          endIcon={<ChevronRightIcon />}
          sx={{ alignSelf: { xs: "stretch", sm: "flex-start" }, minHeight: 44 }}
          to={`/years/${summaryYear}`}
          variant="outlined"
        >
          {formatYearLabel(summaryYear)}の年次サマリーを見る
        </Button>

        <SummarySectionErrorBoundary message="週次サマリーを読み込めませんでした。">
          <WeeklySummarySection
            key={sectionRetryKey}
            currentWeekStartDate={currentWeekStartDate}
            weekStartDate={weekStartDate}
            onRetry={() => setSectionRetryKey((key) => key + 1)}
          />
        </SummarySectionErrorBoundary>
      </Stack>
    </Box>
  );
}
