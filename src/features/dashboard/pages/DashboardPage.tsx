import { api } from "../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Alert, Box, Button, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { WEEK_SESSION_LOAD_ERROR_MESSAGE } from "../../week";
import { CategoryBreakdownCard } from "../../summary-shared/components/CategoryBreakdownCard";
import { SummarySectionErrorBoundary } from "../../summary-shared/components/SummarySectionErrorBoundary";
import { SuzumemoLoadingState } from "../../ui";
import { DashboardInputPanel } from "../components/DashboardInputPanel";
import { DashboardMonthlySummaryLink } from "../components/DashboardMonthlySummaryLink";
import { DashboardYearlySummaryLink } from "../components/DashboardYearlySummaryLink";
import { DashboardPeriodRow } from "../components/DashboardPeriodRow";
import { DashboardSummaryLink } from "../components/DashboardSummaryLink";
import { DashboardSummaryRow } from "../components/DashboardSummaryRow";
import { WeekComparisonChart } from "../components/WeekComparisonChart";
import { useWeekSession, type WeekSession } from "../hooks/useWeekSession";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { getCurrentYear } from "../../../../lib/domain/common/year";

function DashboardSummarySection({
  currentMonth,
  currentYear,
  isCompact,
  weekSession,
}: {
  currentMonth: string;
  currentYear: string;
  isCompact: boolean;
  weekSession: WeekSession;
}) {
  const summary = useQuery(api.receipts.summaries.getWeekSummaryWithCategories, {
    weekStartDate: weekSession.weekStartDate,
  });

  const { weekEndDate, weekStartDate, status } = weekSession;
  const isLoading = summary === undefined;
  const count = summary?.count ?? 0;
  const totalAmountYen = summary?.totalAmountYen ?? 0;
  const totalIncomeYen = summary?.totalIncomeYen ?? 0;
  const prevWeekTotalAmountYen = summary?.prevWeekTotalAmountYen ?? null;
  const byCategory = summary?.byCategory ?? [];

  const categorySection = (
    <CategoryBreakdownCard
      byCategory={byCategory}
      count={count}
      emptyMessage="まだ記録がありません"
      isLoading={isLoading}
      showPercentage
      title="支出カテゴリ"
      totalAmountYen={totalAmountYen}
    />
  );

  const inputPanel = (
    <DashboardInputPanel
      count={count}
      isLoading={isLoading}
      status={status}
      weekStartDate={weekStartDate}
    />
  );

  return isCompact ? (
    <>
      <DashboardSummaryRow
        count={count}
        currentTotalAmountYen={totalAmountYen}
        totalIncomeYen={totalIncomeYen}
        isLoading={isLoading}
        prevWeekTotalAmountYen={prevWeekTotalAmountYen}
        status={status}
        weekEndDate={weekEndDate}
        weekStartDate={weekStartDate}
      />

      {inputPanel}

      <DashboardPeriodRow weekEndDate={weekEndDate} weekStartDate={weekStartDate} />

      <WeekComparisonChart
        currentTotalAmountYen={totalAmountYen}
        isLoading={isLoading}
        prevWeekTotalAmountYen={prevWeekTotalAmountYen}
      />

      {categorySection}
      {status !== "completed" && <DashboardSummaryLink weekStartDate={weekStartDate} />}
      <DashboardMonthlySummaryLink month={currentMonth} />
      <DashboardYearlySummaryLink year={currentYear} />
    </>
  ) : (
    <>
      <DashboardSummaryRow
        count={count}
        currentTotalAmountYen={totalAmountYen}
        totalIncomeYen={totalIncomeYen}
        isLoading={isLoading}
        prevWeekTotalAmountYen={prevWeekTotalAmountYen}
        status={status}
        weekEndDate={weekEndDate}
        weekStartDate={weekStartDate}
      />

      <Box className="dashboard-grid">
        {inputPanel}
        {categorySection}
      </Box>

      <WeekComparisonChart
        currentTotalAmountYen={totalAmountYen}
        isLoading={isLoading}
        prevWeekTotalAmountYen={prevWeekTotalAmountYen}
      />

      <DashboardMonthlySummaryLink month={currentMonth} />
    </>
  );
}

export function DashboardPage() {
  const { weekSession, sessionError, retrySession } = useWeekSession();
  const theme = useTheme();
  const isCompact = !useMediaQuery(theme.breakpoints.up("md"));
  const currentMonth = getCurrentMonth();
  const currentYear = getCurrentYear();

  if (!weekSession && !sessionError) {
    return (
      <SuzumemoLoadingState
        label="データを読み込み中"
        message="今週のセッションを準備しています…"
        variant="page"
      />
    );
  }

  if (sessionError || !weekSession) {
    return (
      <Box className="app-main">
        <Alert
          action={
            <Button color="inherit" onClick={retrySession} size="small">
              再試行
            </Button>
          }
          severity="error"
          variant="outlined"
        >
          {sessionError || WEEK_SESSION_LOAD_ERROR_MESSAGE}
        </Alert>
      </Box>
    );
  }

  return (
    <Box className="app-main">
      <Stack spacing={2.5}>
        {isCompact ? (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box
              alt=""
              component="img"
              src="/suzumemo-app-icon.svg"
              sx={{ height: 28, width: 28 }}
            />
            <Typography component="h1" variant="h5">
              今週のダッシュボード
            </Typography>
          </Stack>
        ) : (
          <Typography component="h1" variant="h4">
            今週のダッシュボード
          </Typography>
        )}

        <SummarySectionErrorBoundary message="今週のサマリーを読み込めませんでした。">
          <DashboardSummarySection
            currentMonth={currentMonth}
            currentYear={currentYear}
            isCompact={isCompact}
            weekSession={weekSession}
          />
        </SummarySectionErrorBoundary>
      </Stack>
    </Box>
  );
}
