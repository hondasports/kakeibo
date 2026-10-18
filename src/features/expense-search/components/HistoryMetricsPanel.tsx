import { Box, Paper, Stack, Typography } from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";
import { formatSignedYen } from "./historyFormat";

function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "good" | "warning";
}) {
  const color =
    tone === "good" ? "success.main" : tone === "warning" ? "error.main" : "text.primary";

  return (
    <Stack
      aria-label={label}
      data-metric={label}
      role="group"
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
      <Typography color="text.secondary" variant="caption">
        {detail}
      </Typography>
    </Stack>
  );
}

export function HistoryMetricsPanel({
  totalCount,
  expenseCount,
  incomeCount,
  totalExpenseYen,
  totalIncomeYen,
  netAmountYen,
}: {
  totalCount: number;
  expenseCount: number;
  incomeCount: number;
  totalExpenseYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
}) {
  return (
    <Paper className="paper-panel history-search-metrics" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box
          sx={{
            display: "grid",
            gap: { xs: 2, sm: 0 },
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              sm: "repeat(4, minmax(0, 1fr))",
            },
            "& > [data-metric] + [data-metric]": {
              borderLeft: { sm: "1px solid" },
              borderColor: "divider",
            },
          }}
        >
          <Metric
            detail={`支出${expenseCount}・収入${incomeCount}`}
            label="該当件数"
            value={`${totalCount}件`}
          />
          <Metric
            detail={`${expenseCount}グループ`}
            label="支出"
            value={formatYen(totalExpenseYen)}
          />
          <Metric
            detail={`${incomeCount}件`}
            label="収入"
            tone="good"
            value={formatYen(totalIncomeYen)}
          />
          <Metric
            detail="収入 − 支出"
            label="差引"
            tone={netAmountYen < 0 ? "warning" : "good"}
            value={formatSignedYen(netAmountYen)}
          />
        </Box>
      </Box>
    </Paper>
  );
}
