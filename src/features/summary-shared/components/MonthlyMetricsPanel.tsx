import { Box, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { formatYen, formatYenAbs } from "../../../utils/currency";

function formatNetAmount(value: number): string {
  if (value === 0) {
    return formatYen(0);
  }
  return `${value < 0 ? "−" : "+"}${formatYenAbs(value)}`;
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
    <Stack
      aria-label={label}
      data-metric={label}
      spacing={0.5}
      sx={{ minWidth: 0, textAlign: "center" }}
    >
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography
        color={color}
        sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
        variant="h5"
      >
        {value}
      </Typography>
    </Stack>
  );
}

export function MonthlyMetricsPanel({
  isLoading,
  netAmountYen,
  totalAmountYen,
  totalIncomeYen,
}: {
  isLoading: boolean;
  netAmountYen: number;
  totalAmountYen: number;
  totalIncomeYen: number;
}) {
  return (
    <Paper className="paper-panel monthly-summary-metrics" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        {isLoading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {[0, 1, 2].map((key) => (
              <Skeleton
                data-testid="monthly-metric-skeleton"
                key={key}
                height={58}
                sx={{ mx: { xs: 0.5, sm: 1 } }}
                variant="rounded"
              />
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              "& > [data-metric] + [data-metric]": {
                borderLeft: "1px solid",
                borderColor: "divider",
              },
            }}
          >
            <Metric label="支出" value={formatYen(totalAmountYen)} />
            <Metric label="収入" tone="good" value={formatYen(totalIncomeYen)} />
            <Metric
              label="差引"
              tone={netAmountYen < 0 ? "warning" : "good"}
              value={formatNetAmount(netAmountYen)}
            />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
