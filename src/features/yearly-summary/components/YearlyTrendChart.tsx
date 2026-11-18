import { LineChart } from "@mui/x-charts/LineChart";
import {
  Box,
  Paper,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { formatYenAxisTick } from "../../../../lib/domain/common/currency";
import {
  groupedMaxYen,
  stackedMaxYen,
  valueAxisEndMargin,
  yAxisWidthForLabels,
  yenAxisTickLabels,
} from "../../../utils/chartAxisLayout";
import { buildYearlyLineSeries, type YearlyTrendChartData } from "../utils/yearlyTrendChartData";

export type YearlyChartMode = "balance" | "category";

type YearlyTrendChartProps = {
  chartData?: YearlyTrendChartData;
  isLoading?: boolean;
  mode: YearlyChartMode;
  onModeChange: (mode: YearlyChartMode) => void;
};

export function YearlyTrendChart({
  chartData,
  isLoading = false,
  mode,
  onModeChange,
}: YearlyTrendChartProps) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const labels = chartData?.labels ?? [];
  const expense = chartData?.expense ?? [];
  const income = chartData?.income ?? [];
  const series = chartData?.series ?? [];
  const dataset = chartData?.dataset ?? [];
  // 縦軸は今のモードで実際に描く系列の値から決める。収支は支出と収入の並列、カテゴリ別は積み上げの合計。
  // 描かない収入を含めると、支出だけの軸が万円表記に丸められて読めなくなるため。
  const axisMaxYen =
    mode === "balance"
      ? groupedMaxYen(dataset, ["expense", "income"])
      : stackedMaxYen(
          dataset,
          series.map((entry) => entry.dataKey),
        );
  // 縦軸の目盛りは幅が固定だと切れるため、目盛りの文字数から幅を決める。
  const yAxisWidth = yAxisWidthForLabels(yenAxisTickLabels(axisMaxYen));
  // 横軸の最後の月ラベルは中央揃えで右へはみ出すため、最も長い月ラベルの半分の余白を取る。
  const chartMargin = {
    bottom: 28,
    left: yAxisWidth,
    right: valueAxisEndMargin(["12月"]),
    top: 16,
  };
  const chartHeight = isCompact ? 220 : 260;
  const hasBalanceData = expense.some((value) => value > 0) || income.some((value) => value > 0);
  const hasCategoryData = series.length > 0 && expense.some((value) => value > 0);

  return (
    <Paper className="paper-panel" data-testid="yearly-trend-chart" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
            mb: 1.5,
          }}
        >
          <Typography component="h2" variant="h6">
            月ごとの収支推移
          </Typography>
          <ToggleButtonGroup
            aria-label="年次グラフの表示切替"
            exclusive
            onChange={(_event, nextMode: YearlyChartMode | null) => {
              if (nextMode !== null) {
                onModeChange(nextMode);
              }
            }}
            size="small"
            value={mode}
          >
            <ToggleButton aria-label="収支の折れ線グラフ" sx={{ minHeight: 44 }} value="balance">
              収支推移
            </ToggleButton>
            <ToggleButton
              aria-label="カテゴリ別の積み上げ面グラフ"
              sx={{ minHeight: 44 }}
              value="category"
            >
              カテゴリ別
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {isLoading ? (
          <Skeleton
            data-testid="yearly-trend-chart-loading"
            height={chartHeight}
            variant="rectangular"
          />
        ) : mode === "balance" && !hasBalanceData ? (
          <Typography color="text.secondary" data-testid="yearly-trend-chart-empty" variant="body2">
            月ごとの収支データがあると表示されます
          </Typography>
        ) : mode === "category" && !hasCategoryData ? (
          <Typography color="text.secondary" data-testid="yearly-trend-chart-empty" variant="body2">
            カテゴリ別の支出データがあると表示されます
          </Typography>
        ) : (
          <Box
            aria-label={
              mode === "balance" ? "月ごとの収支推移グラフ" : "カテゴリ別の積み上げ面グラフ"
            }
            data-chart-height={chartHeight}
            role="img"
            sx={{ minWidth: 0, width: "100%" }}
          >
            <LineChart
              dataset={dataset}
              grid={{ horizontal: true }}
              height={chartHeight}
              hideLegend={mode === "balance"}
              margin={chartMargin}
              series={buildYearlyLineSeries(
                mode,
                {
                  dataset,
                  expense,
                  income,
                  labels,
                  series,
                },
                {
                  expense: theme.palette.error.main,
                  income: theme.palette.success.main,
                },
              )}
              skipAnimation
              xAxis={[{ dataKey: "label", scaleType: "point" }]}
              yAxis={[
                {
                  valueFormatter: (value: number | null) =>
                    formatYenAxisTick(value ?? 0, axisMaxYen),
                  width: yAxisWidth,
                },
              ]}
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
