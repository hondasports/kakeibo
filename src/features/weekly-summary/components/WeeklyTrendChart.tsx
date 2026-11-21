import { BarChart } from "@mui/x-charts/BarChart";
import { Box, Paper, Skeleton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  formatWeeklyExpenseTooltip,
  type WeeklyExpenseChartData,
} from "../utils/weeklyExpenseChartData";
import { formatYen, formatYenAxisTick } from "../../../../lib/domain/common/currency";
import { formatDateForDisplay } from "../../../utils/date";
import { yAxisWidthForLabels, yenAxisTickLabels } from "../../../utils/chartAxisLayout";

// 視覚的には隠しつつ、スクリーンリーダーには読み上げさせるための定番スタイル
const visuallyHiddenSx = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

type WeeklyTrendChartProps = {
  chartData?: WeeklyExpenseChartData;
  isLoading?: boolean;
};

export function WeeklyTrendChart({ chartData, isLoading = false }: WeeklyTrendChartProps) {
  const theme = useTheme();
  const isCompact = !useMediaQuery(theme.breakpoints.up("md"));
  const items = chartData?.items ?? [];
  const series = chartData?.series ?? [];
  const dataset = chartData?.dataset ?? [];
  const axisMaxYen = items.reduce((max, item) => Math.max(max, item.amount), 0);
  // 縦軸の目盛りは幅が固定だと "6,000円" が切れるため、目盛りの文字数から幅を決める。
  const yAxisWidth = yAxisWidthForLabels(yenAxisTickLabels(axisMaxYen));
  const chartMargin = { bottom: 28, left: yAxisWidth, right: isCompact ? 8 : 12, top: 16 };
  // 正本（docs/ui-ux-design.md §5.3）では約220pxの固定高を指定している
  const chartHeight = 220;

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

        <Box className="weekly-chart-totals" aria-label="週ごとの支出合計" role="group">
          {items.map((item) => (
            <Typography key={item.weekStartDate} sx={{ fontWeight: 700 }} variant="caption">
              <Box component="span" sx={visuallyHiddenSx}>
                {item.label}
              </Box>
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
                valueFormatter: (value: number | null) => formatYenAxisTick(value ?? 0, axisMaxYen),
                width: yAxisWidth,
              },
            ]}
          />
        </Box>
        <Box className="weekly-chart-ranges" aria-label="週ごとの期間" role="group">
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
            role="group"
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
