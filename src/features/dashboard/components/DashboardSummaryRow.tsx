import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Box, Divider, Paper, Skeleton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { AnimatedCounter } from "../../ui";
import { formatAggregationPeriod } from "../utils/formatAggregationPeriod";
import { calcPrevWeekRatio, formatPrevWeekRatioWithArrow } from "../../../lib/weekComparison";
import { getCurrentMonth } from "../../../../lib/domain/common/month";
import { getCurrentYear } from "../../../../lib/domain/common/year";

type DashboardSummaryRowProps = {
  count: number;
  currentTotalAmountYen: number;
  totalIncomeYen: number;
  isLoading?: boolean;
  prevWeekTotalAmountYen: number | null;
  status?: "draft" | "completed";
  weekEndDate: string;
  weekStartDate: string;
};

function PrevWeekRateDisplay({
  currentTotalAmountYen,
  isLoading,
  prevWeekTotalAmountYen,
  valueVariant = "h5",
}: {
  currentTotalAmountYen: number;
  isLoading: boolean;
  prevWeekTotalAmountYen: number | null;
  valueVariant?: "h4" | "h5";
}) {
  const ratio = calcPrevWeekRatio(currentTotalAmountYen, prevWeekTotalAmountYen);
  const isIncrease = ratio !== null && ratio > 100;
  const isDecrease = ratio !== null && ratio < 100;
  const valueColor = isIncrease ? "error.main" : isDecrease ? "success.main" : "text.secondary";

  return (
    <Stack className="dashboard-summary-metric" spacing={0.75}>
      <Typography color="text.secondary" variant="body2">
        前週比
      </Typography>
      {isLoading ? (
        <Skeleton height={36} variant="text" width={80} />
      ) : (
        <Typography sx={{ color: valueColor, fontWeight: 700 }} variant={valueVariant}>
          {formatPrevWeekRatioWithArrow(ratio)}
        </Typography>
      )}
    </Stack>
  );
}

function MetricBlock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Stack className="dashboard-summary-metric" spacing={0.75}>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      {children}
    </Stack>
  );
}

function SummaryFooter({
  status,
  weekEndDate,
  weekStartDate,
}: {
  status: "draft" | "completed";
  weekEndDate: string;
  weekStartDate: string;
}) {
  return (
    <>
      <Divider sx={{ borderColor: "var(--color-border-subtle)" }} />
      <Stack
        className="dashboard-summary-footer"
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <CalendarTodayOutlinedIcon color="action" sx={{ fontSize: 18 }} />
          <Typography color="text.secondary" variant="body2">
            {formatAggregationPeriod(weekStartDate, weekEndDate)}
          </Typography>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0, sm: 1.5 }}
          sx={{ alignItems: { xs: "flex-end", sm: "center" } }}
        >
          {status !== "completed" && (
            <Typography
              component={Link}
              sx={{
                color: "primary.main",
                fontWeight: 700,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
              to={`/weeks/${weekStartDate}`}
              variant="body2"
            >
              今週のサマリーを見る ›
            </Typography>
          )}
          <Typography
            component={Link}
            sx={{
              color: "primary.main",
              fontWeight: 700,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
            }}
            to={`/months/${getCurrentMonth()}`}
            variant="body2"
          >
            今月の月次サマリーを見る ›
          </Typography>
          <Typography
            component={Link}
            sx={{
              color: "primary.main",
              fontWeight: 700,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
            }}
            to={`/years/${getCurrentYear()}`}
            variant="body2"
          >
            今年の年次サマリーを見る ›
          </Typography>
        </Stack>
      </Stack>
    </>
  );
}

function ExpenseIncomeMetricBlock({
  currentTotalAmountYen,
  isLoading,
  totalIncomeYen,
  valueVariant = "h4",
}: {
  currentTotalAmountYen: number;
  isLoading: boolean;
  totalIncomeYen: number;
  valueVariant?: "h4" | "h5";
}) {
  return (
    <Stack spacing={1.5}>
      <MetricBlock label="今週の支出">
        {isLoading ? (
          <Skeleton height={44} variant="text" />
        ) : (
          <Typography sx={{ fontWeight: 700 }} variant={valueVariant}>
            <AnimatedCounter value={currentTotalAmountYen} suffix="円" />
          </Typography>
        )}
      </MetricBlock>
      <MetricBlock label="今週の収入">
        {isLoading ? (
          <Skeleton height={36} variant="text" />
        ) : (
          <Typography sx={{ fontWeight: 700 }} variant={valueVariant === "h4" ? "h5" : "h6"}>
            <AnimatedCounter value={totalIncomeYen} suffix="円" />
          </Typography>
        )}
      </MetricBlock>
    </Stack>
  );
}

export function DashboardSummaryRow({
  count,
  currentTotalAmountYen,
  totalIncomeYen,
  isLoading = false,
  prevWeekTotalAmountYen,
  status = "draft",
  weekEndDate,
  weekStartDate,
}: DashboardSummaryRowProps) {
  const theme = useTheme();
  const isCompact = !useMediaQuery(theme.breakpoints.up("md"));

  if (isCompact) {
    return (
      <Paper className="paper-panel dashboard-summary-panel" elevation={0}>
        <Box sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <ExpenseIncomeMetricBlock
              currentTotalAmountYen={currentTotalAmountYen}
              isLoading={isLoading}
              totalIncomeYen={totalIncomeYen}
              valueVariant="h4"
            />

            <Divider sx={{ borderColor: "var(--color-border-subtle)" }} />

            <Stack
              className="dashboard-summary-submetrics"
              direction="row"
              divider={
                <Divider
                  flexItem
                  orientation="vertical"
                  sx={{ borderColor: "var(--color-border-subtle)" }}
                />
              }
              spacing={2}
            >
              <MetricBlock label="入力済み">
                {isLoading ? (
                  <Skeleton height={32} variant="text" />
                ) : (
                  <Typography sx={{ fontWeight: 700 }} variant="h5">
                    <AnimatedCounter value={count} suffix="件" />
                  </Typography>
                )}
              </MetricBlock>
              <PrevWeekRateDisplay
                currentTotalAmountYen={currentTotalAmountYen}
                isLoading={isLoading}
                prevWeekTotalAmountYen={prevWeekTotalAmountYen}
              />
            </Stack>
          </Stack>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper className="paper-panel dashboard-summary-panel" elevation={0}>
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack
            className="dashboard-summary-metrics"
            direction="row"
            divider={
              <Divider
                flexItem
                orientation="vertical"
                sx={{ borderColor: "var(--color-border-subtle)" }}
              />
            }
            spacing={3}
          >
            <ExpenseIncomeMetricBlock
              currentTotalAmountYen={currentTotalAmountYen}
              isLoading={isLoading}
              totalIncomeYen={totalIncomeYen}
            />
            <MetricBlock label="入力済み">
              {isLoading ? (
                <Skeleton height={36} variant="text" />
              ) : (
                <Typography sx={{ fontWeight: 700 }} variant="h4">
                  <AnimatedCounter value={count} suffix=" 件" />
                </Typography>
              )}
            </MetricBlock>
            <PrevWeekRateDisplay
              currentTotalAmountYen={currentTotalAmountYen}
              isLoading={isLoading}
              prevWeekTotalAmountYen={prevWeekTotalAmountYen}
              valueVariant="h4"
            />
          </Stack>

          <SummaryFooter status={status} weekEndDate={weekEndDate} weekStartDate={weekStartDate} />
        </Stack>
      </Box>
    </Paper>
  );
}
