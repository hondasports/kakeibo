import { api } from "../../../../convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQuery_experimental } from "convex/react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { formatMonthLabel, getCurrentMonth } from "../../../../lib/domain/common/month";
import { formatYen } from "../../../../lib/domain/common/currency";
import { CategoryBreakdownCard } from "../../summary-shared/components/CategoryBreakdownCard";
import { MonthlyMetricsPanel } from "../../summary-shared/components/MonthlyMetricsPanel";
import { HistoryNavigation } from "../../app-shell";
import { SummarySectionErrorBoundary } from "../../summary-shared/components/SummarySectionErrorBoundary";
import { getCurrentWeekStartDate } from "../../week";
import { YearNavigator } from "../components/YearNavigator";
import { YearlyTrendChart, type YearlyChartMode } from "../components/YearlyTrendChart";
import { addYears, getCurrentYear, isFutureYear, normalizeYear } from "../lib/yearNavigation";
import { buildYearlyTrendChartData } from "../utils/yearlyTrendChartData";

function YearlySummarySection({ year }: { year: string }) {
  const [chartMode, setChartMode] = useState<YearlyChartMode>("balance");
  const yearlySummary = useQuery(api.receipts.summaries.getYearSummary, { year });
  const isSummaryLoading = yearlySummary === undefined;
  const summary = yearlySummary ?? {
    byCategory: [],
    count: 0,
    incomeCount: 0,
    months: [],
    netAmountYen: 0,
    totalAmountYen: 0,
    totalIncomeYen: 0,
    year,
  };
  const chartData = useMemo(
    () => (yearlySummary ? buildYearlyTrendChartData(yearlySummary) : undefined),
    [yearlySummary],
  );

  return (
    <>
      <MonthlyMetricsPanel
        isLoading={isSummaryLoading}
        netAmountYen={summary.netAmountYen}
        totalAmountYen={summary.totalAmountYen}
        totalIncomeYen={summary.totalIncomeYen}
      />

      <YearlyTrendChart
        chartData={chartData}
        isLoading={isSummaryLoading}
        mode={chartMode}
        onModeChange={setChartMode}
      />

      <CategoryBreakdownCard
        byCategory={summary.byCategory}
        count={summary.count}
        emptyMessage="この年の支出はまだありません"
        isLoading={isSummaryLoading}
        showPercentage
        title="年間の支出カテゴリ"
        totalAmountYen={summary.totalAmountYen}
      />

      <Stack spacing={1.5}>
        <Typography component="h2" variant="h6">
          月ごとの支出
        </Typography>
        <Box
          aria-label="月ごとの支出一覧"
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          {(summary.months.length > 0
            ? summary.months
            : Array.from({ length: 12 }, (_, index) => ({
                month: `${year}-${String(index + 1).padStart(2, "0")}`,
                totalAmountYen: 0,
                totalIncomeYen: 0,
              }))
          ).map((month) => (
            <Button
              aria-label={`${formatMonthLabel(month.month)}、支出${formatYen(
                month.totalAmountYen,
              )}、収入${formatYen(month.totalIncomeYen)}`}
              component={Link}
              key={month.month}
              sx={{ justifyContent: "space-between", minHeight: 44 }}
              to={`/months/${month.month}`}
              variant="outlined"
            >
              <span>{formatMonthLabel(month.month)}</span>
              <span>{formatYen(month.totalAmountYen)}</span>
            </Button>
          ))}
        </Box>
      </Stack>
    </>
  );
}

export function YearlySummaryPage() {
  const { year: rawYear } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const currentYear = getCurrentYear();
  const normalizedYear = rawYear ? normalizeYear(rawYear) : null;
  const year =
    normalizedYear !== null && !isFutureYear(normalizedYear, currentYear)
      ? normalizedYear
      : currentYear;

  const userProfileResult = useQuery_experimental({
    query: api.users.queries.getUserProfile,
    args: {},
  });
  const userProfile = userProfileResult.status === "success" ? userProfileResult.data : undefined;
  const weeklyStartDay = userProfile?.weeklyStartDay;
  const monthlyPath = year === currentYear ? `/months/${getCurrentMonth()}` : `/months/${year}-01`;

  useEffect(() => {
    if (rawYear !== year) {
      navigate(`/years/${year}`, { replace: true });
    }
  }, [navigate, rawYear, year]);

  const navigateToYear = (targetYear: string) => {
    const normalizedTarget = normalizeYear(targetYear);
    const safeTarget =
      normalizedTarget !== null && !isFutureYear(normalizedTarget, currentYear)
        ? normalizedTarget
        : currentYear;
    navigate(`/years/${safeTarget}`);
  };

  return (
    <Box className="app-main">
      <Stack spacing={3}>
        <HistoryNavigation
          monthlyPath={monthlyPath}
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
            年次サマリー
          </Typography>
        </Stack>

        <YearNavigator
          currentYear={currentYear}
          onCurrentYear={() => navigateToYear(currentYear)}
          onNextYear={() => navigateToYear(addYears(year, 1))}
          onPreviousYear={() => navigateToYear(addYears(year, -1))}
          onYearChange={navigateToYear}
          year={year}
        />

        <SummarySectionErrorBoundary message="年次サマリーを読み込めませんでした。">
          <YearlySummarySection year={year} />
        </SummarySectionErrorBoundary>
      </Stack>
    </Box>
  );
}
