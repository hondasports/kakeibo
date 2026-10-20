import { BarChart } from "@mui/x-charts/BarChart";
import { Box, Paper, Skeleton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  formatWeeklyExpenseTooltip,
  type WeeklyExpenseChartData,
} from "../utils/weeklyExpenseChartData";
import { formatYen, formatYenCompact } from "../../../../lib/domain/common/currency";
import { formatDateForDisplay } from "../../../utils/date";

type WeeklyTrendChartProps = {
  chartData?: WeeklyExpenseChartData;
  isLoading?: boolean;
};

export function WeeklyTrendChart({ chartData, isLoading = false }: WeeklyTrendChartProps) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const items = chartData?.items ?? [];
  const series = chartData?.series ?? [];
  const dataset = chartData?.dataset ?? [];
  const chartMargin = isCompact
    ? { bottom: 28, left: 56, right: 8, top: 16 }
    : { bottom: 28, left: 52, right: 12, top: 16 };
  const yAxisWidth = isCompact ? 60 : 52;
  const chartHeight = isCompact ? 180 : 200;

  if (isLoading) {
    return (
      <Paper className="paper-panel" data-testid="weekly-expense-trend-loading" elevation={0}>
        <Box sx={{ p: 2.5 }}>
          <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
            週別支出推移
          </Typography>
          <Skeleton height={chartHeight} variant="rectangular" />
        </Box>
      </Paper>
    );
  }

  if (items.length === 0 || items.every((item) => item.amount === 0)) {
    return (
      <Paper className="paper-panel" data-testid="weekly-expense-trend-empty" elevation={0}>
        <Box sx={{ p: 2.5 }}>
          <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
            週別支出推移
          </Typography>
          <Typography color="text.secondary" variant="body2">
            週別の支出データがあると表示されます
          </Typography>
        </Box>
      </Paper>
    );
  }

  const chartSeries =
    series.length > 0
      ? series.map((entry) => ({
          dataKey: entry.dataKey,
          label: entry.label,
          stack: "total",
          valueFormatter: (_value: number | null, context: { dataIndex: number }) => {
            const item = items[context.dataIndex];
            return item ? formatWeeklyExpenseTooltip(item) : "";
          },
        }))
      : [
          {
            dataKey: "amount",
            label: "支出合計",
            valueFormatter: (_value: number | null, context: { dataIndex: number }) => {
              const item = items[context.dataIndex];
              return item ? formatWeeklyExpenseTooltip(item) : "";
            },
          },
        ];

  return (
    <Paper className="paper-panel" data-testid="weekly-expense-trend-chart" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
          週別支出推移
        </Typography>

        <Box className="weekly-chart-totals" aria-label="週ごとの支出合計">
          {items.map((item) => (
            <Typography key={item.weekStartDate} sx={{ fontWeight: 700 }} variant="caption">
              {formatYen(item.amount)}
            </Typography>
          ))}
        </Box>

        <Box
          aria-label="週別支出推移グラフ"
          data-chart-height={chartHeight}
          role="img"
          sx={{ minWidth: 0, width: "100%" }}
        >
          <BarChart
            axisHighlight={{ x: "band" }}
            borderRadius={6}
            colors={
              series.length > 0 ? series.map((entry) => entry.color) : [theme.palette.primary.main]
            }
            dataset={dataset}
            height={chartHeight}
            hideLegend
            margin={chartMargin}
            series={chartSeries}
            skipAnimation
            xAxis={[{ dataKey: "label", scaleType: "band" }]}
            yAxis={[
              {
                valueFormatter: formatYenCompact,
                width: yAxisWidth,
              },
            ]}
          />
        </Box>
        <Box className="weekly-chart-ranges" aria-label="週ごとの期間">
          {items.map((item) => (
            <Typography key={item.weekStartDate} color="text.secondary" variant="caption">
              {formatDateForDisplay(item.weekStartDate)}〜{formatDateForDisplay(item.weekEndDate)}
            </Typography>
          ))}
        </Box>
        {series.length > 0 && (
          <Stack
            aria-label="カテゴリ凡例"
            className="weekly-chart-legend"
            direction="row"
            useFlexGap
          >
            {series.map((entry) => (
              <Stack
                direction="row"
                key={entry.dataKey}
                spacing={0.75}
                sx={{ alignItems: "center" }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color }}
                />
                <Typography variant="caption">{entry.label}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
