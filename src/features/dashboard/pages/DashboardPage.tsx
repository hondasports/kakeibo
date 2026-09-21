import { useQuery } from "convex/react";
import { getWeekSummaryWithCategoriesApi } from "../../../lib/repositories/receipts";
import { Alert, Box, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CategoryBreakdownCard } from "../../weekly-summary/components/CategoryBreakdownCard";
import { SuzumemoLoadingState } from "../../ui";
import { DashboardInputPanel } from "../components/DashboardInputPanel";
import { DashboardMonthlySummaryLink } from "../components/DashboardMonthlySummaryLink";
import { DashboardYearlySummaryLink } from "../components/DashboardYearlySummaryLink";
import { DashboardPeriodRow } from "../components/DashboardPeriodRow";
import { DashboardSummaryLink } from "../components/DashboardSummaryLink";
import { DashboardSummaryRow } from "../components/DashboardSummaryRow";
import { WeekComparisonChart } from "../components/WeekComparisonChart";
import { useWeekSession } from "../hooks/useWeekSession";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { getCurrentYear } from "../../../../lib/domain/common/year";

export function DashboardPage() {
  const { weekSession, sessionError } = useWeekSession();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const currentMonth = getCurrentMonth();
  const currentYear = getCurrentYear();

  const summary = useQuery(
    getWeekSummaryWithCategoriesApi(),
    weekSession ? { weekStartDate: weekSession.weekStartDate } : "skip",
  );

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
        <Alert severity="error" variant="outlined">
          {sessionError || "週次セッションの読み込みに失敗しました。"}
        </Alert>
      </Box>
    );
  }

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
              今週
            </Typography>
          </Stack>
        ) : (
          <Typography component="h1" variant="h4">
            今週のダッシュボード
          </Typography>
        )}

        <DashboardSummaryRow
          count={count}
          currentTotalAmountYen={totalAmountYen}
          totalIncomeYen={totalIncomeYen}
          isLoading={isLoading}
          prevWeekTotalAmountYen={prevWeekTotalAmountYen}
          weekEndDate={weekEndDate}
          weekStartDate={weekStartDate}
        />

        {isCompact && (
          <DashboardPeriodRow weekEndDate={weekEndDate} weekStartDate={weekStartDate} />
        )}

        <WeekComparisonChart
          currentTotalAmountYen={totalAmountYen}
          isLoading={isLoading}
          prevWeekTotalAmountYen={prevWeekTotalAmountYen}
        />

        {isCompact ? (
          <>
            {inputPanel}
            {categorySection}
            <DashboardSummaryLink weekStartDate={weekStartDate} />
            <DashboardMonthlySummaryLink month={currentMonth} />
            <DashboardYearlySummaryLink year={currentYear} />
          </>
        ) : (
          <Box className="dashboard-grid">
            {categorySection}
            {inputPanel}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
