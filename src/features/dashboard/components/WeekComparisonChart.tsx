import { Box, Paper, Skeleton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  calcPrevWeekDiff,
  calcPrevWeekRate,
  formatPrevWeekDiff,
  formatPrevWeekRate,
} from "../../../lib/weekComparison";
import { formatYen } from "../../../../lib/domain/common/currency";

type WeekComparisonChartProps = {
  currentTotalAmountYen: number;
  prevWeekTotalAmountYen: number | null;
  isLoading?: boolean;
};

function formatDiffSummary(diff: number | null, rate: number | null): string {
  if (diff === null) {
    return "前週データなし";
  }
  const diffText = formatPrevWeekDiff(diff);
  if (rate === null) {
    return `差額 ${diffText}`;
  }
  return `差額 ${diffText} (${formatPrevWeekRate(rate)})`;
}

function hasComparisonData(
  currentTotalAmountYen: number,
  prevWeekTotalAmountYen: number | null,
): boolean {
  return (
    currentTotalAmountYen > 0 || (prevWeekTotalAmountYen !== null && prevWeekTotalAmountYen > 0)
  );
}

type ComparisonBar = {
  amount: number;
  label: string;
  tone: "current" | "previous";
};

function barSizePercent(amount: number, maxAmount: number): number {
  if (maxAmount <= 0 || amount <= 0) {
    return 0;
  }
  return (amount / maxAmount) * 100;
}

function ComparisonBars({
  bars,
  isCompact,
  maxAmount,
}: {
  bars: ComparisonBar[];
  isCompact: boolean;
  maxAmount: number;
}) {
  if (isCompact) {
    return (
      <Box
        aria-label="前週との比較グラフ"
        className="dashboard-comparison-bars dashboard-comparison-sp-grid"
        role="img"
      >
        {bars.map((bar) => {
          const widthPercent = barSizePercent(bar.amount, maxAmount);
          const barWidth = widthPercent > 0 ? `max(${widthPercent}%, 3px)` : "0";
          return (
            <Box key={bar.label} className="dashboard-comparison-sp-grid-item">
              <Typography className="dashboard-comparison-bar-label" variant="body2">
                {bar.label}
              </Typography>
              <Box className="dashboard-comparison-bar-track-horizontal">
                <Box
                  className={`dashboard-comparison-bar dashboard-comparison-bar--horizontal dashboard-comparison-bar--${bar.tone}`}
                  sx={{ width: barWidth }}
                />
              </Box>
              <Typography className="dashboard-comparison-bar-amount" variant="body2">
                {formatYen(bar.amount)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box aria-label="前週との比較グラフ" className="dashboard-comparison-plot" role="img">
      <Box className="dashboard-comparison-plot-amounts">
        {bars.map((bar) => (
          <Typography
            key={`${bar.label}-amount`}
            className="dashboard-comparison-bar-amount"
            variant="body2"
          >
            {formatYen(bar.amount)}
          </Typography>
        ))}
      </Box>
      <Box className="dashboard-comparison-plot-bars">
        {bars.map((bar) => {
          const heightPercent = barSizePercent(bar.amount, maxAmount);
          return (
            <Box
              key={`${bar.label}-bar`}
              className={`dashboard-comparison-bar dashboard-comparison-bar--vertical dashboard-comparison-bar--${bar.tone}`}
              sx={{
                height: heightPercent > 0 ? `max(${heightPercent}%, 4px)` : 0,
              }}
            />
          );
        })}
      </Box>
      <Box className="dashboard-comparison-plot-labels">
        {bars.map((bar) => (
          <Typography
            key={`${bar.label}-label`}
            className="dashboard-comparison-bar-label"
            color="text.secondary"
            variant="body2"
          >
            {bar.label}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export function WeekComparisonChart({
  currentTotalAmountYen,
  prevWeekTotalAmountYen,
  isLoading = false,
}: WeekComparisonChartProps) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const diff = calcPrevWeekDiff(currentTotalAmountYen, prevWeekTotalAmountYen);
  const rate = calcPrevWeekRate(currentTotalAmountYen, prevWeekTotalAmountYen);
  const diffSummary = formatDiffSummary(diff, rate);

  if (isLoading) {
    return (
      <Paper className="paper-panel" data-testid="week-comparison-loading" elevation={0}>
        <Box sx={{ p: 2.5 }}>
          <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
            前週との比較
          </Typography>
          <Skeleton height={180} variant="rectangular" />
        </Box>
      </Paper>
    );
  }

  if (
    prevWeekTotalAmountYen === null ||
    !hasComparisonData(currentTotalAmountYen, prevWeekTotalAmountYen)
  ) {
    return (
      <Paper className="paper-panel" data-testid="week-comparison-empty" elevation={0}>
        <Box sx={{ p: 2.5 }}>
          <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
            前週との比較
          </Typography>
          <Typography color="text.secondary" variant="body2">
            前週との比較データがあると表示されます
          </Typography>
        </Box>
      </Paper>
    );
  }

  const bars: ComparisonBar[] = [
    { amount: prevWeekTotalAmountYen, label: "前週", tone: "previous" },
    { amount: currentTotalAmountYen, label: "今週", tone: "current" },
  ];

  const maxAmount = Math.max(...bars.map((bar) => bar.amount), 1);

  return (
    <Paper className="paper-panel" data-testid="week-comparison-chart" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        {!isCompact ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "baseline", flexWrap: "wrap", mb: 2 }}
          >
            <Typography component="h2" variant="h6">
              前週との比較
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {diffSummary}
            </Typography>
          </Stack>
        ) : (
          <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
            前週との比較
          </Typography>
        )}

        <ComparisonBars bars={bars} isCompact={isCompact} maxAmount={maxAmount} />

        {isCompact && (
          <Typography
            color="text.secondary"
            sx={{ fontWeight: 700, mt: 1.5, textAlign: "center" }}
            variant="body2"
          >
            {diffSummary}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
