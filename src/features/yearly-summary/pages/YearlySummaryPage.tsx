import { api } from "../../../../convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { formatMonthLabel } from "../../../../lib/domain/common/month";
import { formatYen } from "../../../utils/currency";
import { CategoryBreakdownCard } from "../../weekly-summary/components/CategoryBreakdownCard";
import { MonthlyMetricsPanel } from "../../monthly-summary/components/MonthlyMetricsPanel";
import { YearNavigator } from "../components/YearNavigator";
import { YearlyTrendChart, type YearlyChartMode } from "../components/YearlyTrendChart";
import { addYears, getCurrentYear, isFutureYear, normalizeYear } from "../lib/yearNavigation";
import { buildYearlyTrendChartData } from "../utils/yearlyTrendChartData";

export function YearlySummaryPage() {
  const { year: rawYear } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const [chartMode, setChartMode] = useState<YearlyChartMode>("balance");
  const currentYear = getCurrentYear();
  const normalizedYear = rawYear ? normalizeYear(rawYear) : null;
  const year =
    normalizedYear !== null && !isFutureYear(normalizedYear, currentYear)
      ? normalizedYear
      : currentYear;

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
            月ごとの合計
          </Typography>
          <Box
            aria-label="月ごとの合計一覧"
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
      </Stack>
    </Box>
  );
}
