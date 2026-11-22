import { Box, LinearProgress, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { formatSignedYen, formatYen } from "../../../../lib/domain/common/currency";
import { monthlyBudgetProgress } from "../../../../lib/domain/groups/monthlyBudget";

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
    </Stack>
  );
}

export function MonthlyMetricsPanel({
  isLoading,
  monthlyBudgetYen,
  netAmountYen,
  scopeLabel,
  showBudget = false,
  totalAmountYen,
  totalIncomeYen,
}: {
  isLoading: boolean;
  monthlyBudgetYen?: number;
  netAmountYen: number;
  scopeLabel?: string;
  // 予算の消化率・残額は「今月」を表示しているときだけ出す（過去月には出さない）
  showBudget?: boolean;
  totalAmountYen: number;
  totalIncomeYen: number;
}) {
  return (
    <Paper className="paper-panel monthly-summary-metrics" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        {scopeLabel && (
          <Typography
            color="text.secondary"
            sx={{ display: "block", mb: 1, textAlign: "center" }}
            variant="caption"
          >
            {scopeLabel}
          </Typography>
        )}
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
              value={formatSignedYen(netAmountYen)}
            />
          </Box>
        )}
        {!isLoading && showBudget && monthlyBudgetYen !== undefined && (
          <MonthlyBudgetStrip budgetYen={monthlyBudgetYen} spentYen={totalAmountYen} />
        )}
      </Box>
    </Paper>
  );
}

/** 月予算に対する消化率と残額。今月・予算設定済みのときのみ表示する。 */
function MonthlyBudgetStrip({ budgetYen, spentYen }: { budgetYen: number; spentYen: number }) {
  const { remainingYen, usedPercent } = monthlyBudgetProgress(budgetYen, spentYen);
  const over = remainingYen < 0;
  return (
    <Stack aria-label="月予算" spacing={0.75} sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
        <Typography color="text.secondary" variant="body2">
          月予算 {formatYen(budgetYen)} のうち {usedPercent}% 使用
        </Typography>
        <Typography
          color={over ? "error.main" : "text.secondary"}
          sx={{ fontWeight: over ? 700 : 400 }}
          variant="body2"
        >
          {over ? `${formatYen(-remainingYen)} 超過` : `残り ${formatYen(remainingYen)}`}
        </Typography>
      </Stack>
      <LinearProgress
        aria-label="予算消化率"
        color={over ? "error" : usedPercent >= 80 ? "warning" : "primary"}
        sx={{ borderRadius: 999, height: 6 }}
        value={Math.min(usedPercent, 100)}
        variant="determinate"
      />
    </Stack>
  );
}
