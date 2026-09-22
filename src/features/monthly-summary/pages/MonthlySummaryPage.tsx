import { api } from "../../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ExpenseEntryDeleteDialog } from "../../summary-shared/components/ExpenseEntryDeleteDialog";
import { ExpenseEntryEditDialog } from "../../summary-shared/components/ExpenseEntryEditDialog";
import { CategoryBreakdownCard } from "../../summary-shared/components/CategoryBreakdownCard";
import { IncomeListCard } from "../../summary-shared/components/IncomeListCard";
import { ReceiptListCard } from "../../summary-shared/components/ReceiptListCard";
import { incomeItemToReceiptItem, type ReceiptItem } from "../../summary-shared/types/types";
import { HistoryNavigation } from "../../app-shell/components/HistoryNavigation";
import { getCurrentWeekStartDate } from "../../week";
import { formatJapaneseDate } from "../../../utils/date";
import { MonthlySpendingCalendar } from "../components/MonthlySpendingCalendar";
import { MonthNavigator } from "../components/MonthNavigator";
import { MonthlyMetricsPanel } from "../../summary-shared/components/MonthlyMetricsPanel";
import { formatYearLabel } from "../../../../lib/domain/common/year";
import { addMonths, getCurrentMonth, isFutureMonth, normalizeMonth } from "../lib/monthNavigation";
import { isDateInMonth } from "../utils/monthlySpendingCalendar";

export function MonthlySummaryPage() {
  const { month: rawMonth } = useParams<{ month: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const currentMonth = getCurrentMonth();
  const normalizedMonth = rawMonth ? normalizeMonth(rawMonth) : null;
  const month =
    normalizedMonth !== null && !isFutureMonth(normalizedMonth, currentMonth)
      ? normalizedMonth
      : currentMonth;

  const deleteExpenseEntry = useMutation(api.expenseEntries.mutations.deleteExpenseEntry);
  const deleteReceipt = useMutation(api.receipts.crud.deleteReceipt);
  const userProfile = useQuery(api.users.queries.getUserProfile);
  const categoriesQuery = useQuery(api.categories.queries.listActive);
  const monthlySummary = useQuery(api.receipts.summaries.getMonthSummaryWithCategories, { month });
  const categories = Array.isArray(categoriesQuery) ? categoriesQuery : [];
  const isSummaryLoading = monthlySummary === undefined;
  const summary = monthlySummary ?? {
    byCategory: [],
    count: 0,
    incomeCount: 0,
    incomes: [],
    netAmountYen: 0,
    receipts: [],
    totalAmountYen: 0,
    totalIncomeYen: 0,
  };
  const dateQuery = searchParams.get("date");
  const selectedDate = dateQuery !== null && isDateInMonth(dateQuery, month) ? dateQuery : null;
  const visibleReceipts = selectedDate
    ? summary.receipts.filter((receipt) => receipt.date === selectedDate)
    : summary.receipts;
  const visibleIncomes = selectedDate
    ? summary.incomes.filter((income) => income.date === selectedDate)
    : summary.incomes;
  const dateLabel = selectedDate ? formatJapaneseDate(selectedDate) : null;
  const monthlyHistoryPath = selectedDate
    ? `/months/${month}?date=${selectedDate}`
    : `/months/${month}`;
  const weeklyStartDay = userProfile?.weeklyStartDay;

  useEffect(() => {
    if (rawMonth !== month) {
      navigate(`/months/${month}`, { replace: true });
    }
  }, [month, navigate, rawMonth]);

  useEffect(() => {
    if (dateQuery !== null && selectedDate === null) {
      navigate(`/months/${month}`, { replace: true });
    }
  }, [dateQuery, month, navigate, selectedDate]);

  const navigateToMonth = (targetMonth: string) => {
    const normalizedTarget = normalizeMonth(targetMonth);
    const safeTarget =
      normalizedTarget !== null && !isFutureMonth(normalizedTarget, currentMonth)
        ? normalizedTarget
        : currentMonth;
    navigate(`/months/${safeTarget}`);
  };

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

  return (
    <Box className="app-main">
      <Stack spacing={3}>
        <HistoryNavigation
          monthlyPath={monthlyHistoryPath}
          searchPath="/search"
          weeklyPath={`/weeks/${getCurrentWeekStartDate(weeklyStartDay)}`}
        />
        <Stack className="summary-header" direction="row">
          <Box
            alt=""
            className="summary-header-icon"
            component="img"
            height={32}
            src="/suzumemo-app-icon.svg"
            width={32}
          />
          <Typography component="h1" variant="h4">
            月次サマリー
          </Typography>
        </Stack>

        <MonthNavigator
          currentMonth={currentMonth}
          month={month}
          onCurrentMonth={() => navigateToMonth(currentMonth)}
          onMonthChange={navigateToMonth}
          onNextMonth={() => navigateToMonth(addMonths(month, 1))}
          onPreviousMonth={() => navigateToMonth(addMonths(month, -1))}
        />

        <Button
          component={Link}
          sx={{ alignSelf: { xs: "stretch", sm: "flex-start" }, minHeight: 44 }}
          to={`/years/${month.slice(0, 4)}`}
          variant="outlined"
        >
          {formatYearLabel(month.slice(0, 4))}の年次サマリーを見る
        </Button>

        <MonthlySpendingCalendar
          expenses={summary.receipts}
          incomes={summary.incomes}
          isLoading={isSummaryLoading}
          month={month}
          onDateSelect={(date) => navigate(`/months/${month}?date=${date}`)}
          selectedDate={selectedDate}
        />

        {deleteError && (
          <Alert severity="error" variant="outlined" onClose={() => setDeleteError("")}>
            {deleteError}
          </Alert>
        )}

        <MonthlyMetricsPanel
          isLoading={isSummaryLoading}
          netAmountYen={summary.netAmountYen}
          totalAmountYen={summary.totalAmountYen}
          totalIncomeYen={summary.totalIncomeYen}
        />

        <CategoryBreakdownCard
          byCategory={summary.byCategory}
          count={summary.count}
          emptyMessage="この月の支出はまだありません"
          isLoading={isSummaryLoading}
          showPercentage
          title="支出カテゴリ"
          totalAmountYen={summary.totalAmountYen}
        />

        {selectedDate && dateLabel && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
          >
            <Typography component="h2" variant="h6">
              {dateLabel}の明細
            </Typography>
            <Button
              onClick={() => navigate(`/months/${month}`)}
              sx={{ alignSelf: { xs: "flex-start", sm: "auto" }, minHeight: 44 }}
              variant="outlined"
            >
              月全体を見る
            </Button>
          </Stack>
        )}

        <ReceiptListCard
          count={visibleReceipts.length}
          emptyMessage={
            selectedDate ? "この日の支出はまだありません" : "この月の支出はまだありません"
          }
          isLoading={isSummaryLoading}
          listAriaLabel={dateLabel ? `${dateLabel}の支出一覧` : "月次サマリーの支出一覧"}
          onDeleteReceipt={setDeletingReceipt}
          onEditReceipt={setEditingReceipt}
          receipts={visibleReceipts}
        />

        <IncomeListCard
          count={visibleIncomes.length}
          emptyMessage={
            selectedDate ? "この日の収入はまだありません" : "この月の収入はまだありません"
          }
          incomes={visibleIncomes}
          isLoading={isSummaryLoading}
          listAriaLabel={dateLabel ? `${dateLabel}の収入一覧` : "月次サマリーの収入一覧"}
          onDeleteIncome={(income) => setDeletingReceipt(incomeItemToReceiptItem(income))}
          onEditIncome={(income) => setEditingReceipt(incomeItemToReceiptItem(income))}
        />
      </Stack>

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

      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        autoHideDuration={3000}
        onClose={() => setSaveMessage("")}
        open={saveMessage.length > 0}
      >
        <Alert
          aria-live="polite"
          onClose={() => setSaveMessage("")}
          role="status"
          severity="success"
        >
          {saveMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
