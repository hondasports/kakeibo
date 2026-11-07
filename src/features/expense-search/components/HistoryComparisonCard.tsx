import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import type { HistoryComparison } from "../../../../lib/domain/expenseSearch/analytics";
import { formatSignedYen } from "../../../../lib/domain/common/currency";
import { formatDateForDisplay } from "../../../utils/date";
import { formatSignedPercent } from "./historyFormat";

function formatRange(startDate: string, endDate: string): string {
  return `${formatDateForDisplay(startDate)}〜${formatDateForDisplay(endDate)}`;
}

export function HistoryComparisonCard({
  comparison,
  onCategorySelect,
}: {
  comparison: HistoryComparison | null;
  onCategorySelect?: (categoryId: string) => void;
}) {
  if (comparison === null) {
    return null;
  }

  return (
    <Paper className="paper-panel" data-testid="history-comparison" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography component="h2" variant="h6">
              前期間との比較
            </Typography>
            <Typography color="text.secondary" variant="body2">
              今期 {formatRange(comparison.currentStartDate, comparison.currentEndDate)} ／ 前期{" "}
              {formatRange(comparison.previousStartDate, comparison.previousEndDate)}
            </Typography>
          </Box>

          {!comparison.hasPreviousData ? (
            <Typography color="text.secondary" variant="body2">
              比較できる前期間のデータがありません
            </Typography>
          ) : (
            <>
              <Box
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                }}
              >
                <Metric label="支出の増減" value={formatSignedYen(comparison.diffExpenseYen)} />
                <Metric label="収入の増減" value={formatSignedYen(comparison.diffIncomeYen)} />
                <Metric label="差引の増減" value={formatSignedYen(comparison.diffNetYen)} />
              </Box>
              {comparison.categoryChanges.length > 0 ? (
                <Stack spacing={0.75}>
                  <Typography variant="subtitle2">カテゴリ別の変化</Typography>
                  {comparison.categoryChanges.map((category) => {
                    const content = (
                      <>
                        <span>{category.categoryName}</span>
                        <span>
                          {formatSignedYen(category.diffAmountYen)}（
                          {formatSignedPercent(category.diffRatePercent)}）
                        </span>
                      </>
                    );

                    return onCategorySelect ? (
                      <Button
                        key={category.categoryId}
                        onClick={() => onCategorySelect(category.categoryId)}
                        sx={{
                          justifyContent: "space-between",
                          minHeight: 44,
                          textTransform: "none",
                        }}
                        variant="text"
                      >
                        {content}
                      </Button>
                    ) : (
                      <Stack
                        direction="row"
                        key={category.categoryId}
                        spacing={1}
                        sx={{
                          alignItems: "center",
                          justifyContent: "space-between",
                          minHeight: 44,
                        }}
                      >
                        {content}
                      </Stack>
                    );
                  })}
                </Stack>
              ) : null}
            </>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      aria-label={label}
      role="group"
      spacing={0.5}
      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}
    >
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }} variant="h6">
        {value}
      </Typography>
    </Stack>
  );
}
