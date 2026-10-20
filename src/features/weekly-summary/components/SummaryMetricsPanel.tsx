import { Box, Paper, Skeleton, Typography } from "@mui/material";
import { formatYen, formatYenAbs } from "../../../../lib/domain/common/currency";

function formatSignedAmount(value: number | null): string {
  if (value === null) return "比較データなし";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatYenAbs(value)}`;
}

function formatSignedRate(value: number | null): string {
  if (value === null) return "比較データなし";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value)}%`;
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning";
}) {
  const color =
    tone === "good" ? "success.main" : tone === "warning" ? "error.main" : "text.primary";
  return (
    <Box aria-label={label} className="weekly-summary-metric">
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography color={color} sx={{ fontWeight: 700 }} variant="h5">
        {value}
      </Typography>
    </Box>
  );
}

export function SummaryMetricsPanel({
  totalAmountYen,
  totalIncomeYen,
  previousDiff,
  averageRate,
  isLoading = false,
}: {
  totalAmountYen: number;
  totalIncomeYen: number;
  previousDiff: number | null;
  averageRate: number | null;
  isLoading?: boolean;
}) {
  return (
    <Paper
      className="paper-panel weekly-summary-metrics"
      data-testid={isLoading ? "weekly-summary-metrics-loading" : "weekly-summary-metrics"}
      elevation={0}
    >
      {isLoading ? (
        <Box className="weekly-summary-metrics-grid">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={58} variant="rounded" />
          ))}
        </Box>
      ) : (
        <Box className="weekly-summary-metrics-grid">
          <Box className="weekly-summary-metric-stack">
            <Metric label="合計支出" value={`${formatYen(totalAmountYen)}`} />
            <Metric label="合計収入" value={`${formatYen(totalIncomeYen)}`} tone="default" />
          </Box>
          <Metric
            label="前週差"
            value={formatSignedAmount(previousDiff)}
            tone={previousDiff === null ? "default" : previousDiff <= 0 ? "good" : "warning"}
          />
          <Metric
            label="2週平均比"
            value={formatSignedRate(averageRate)}
            tone={averageRate === null ? "default" : averageRate <= 0 ? "good" : "warning"}
          />
        </Box>
      )}
    </Paper>
  );
}
