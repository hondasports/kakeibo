import { BarChart } from "@mui/x-charts/BarChart";
import { Box, Paper, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  buildHistoryCategoryBreakdown,
  HISTORY_OTHER_CATEGORY_ID,
} from "../../../../lib/domain/expenseSearch/analytics";
import type { CategorySummary } from "../../../../lib/domain/receipt/summary";
import { formatYen, formatYenCompact } from "../../../../lib/domain/common/currency";

export function HistoryCategoryChart({
  categories,
  onCategorySelect,
}: {
  categories: CategorySummary[];
  onCategorySelect?: (categoryId: string) => void;
}) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const topCategories = buildHistoryCategoryBreakdown(categories);
  const hasOtherCategory = topCategories.some(
    (category) => category.categoryId === HISTORY_OTHER_CATEGORY_ID,
  );
  const totalAmountYen = categories.reduce((total, category) => total + category.totalAmountYen, 0);

  const hasData = topCategories.some((category) => category.totalAmountYen > 0);
  const chartHeight = Math.max(180, topCategories.length * (isCompact ? 42 : 38) + 64);
  const dataset = topCategories.map((category) => ({
    label: category.categoryName,
    amount: category.totalAmountYen,
  }));

  return (
    <Paper className="paper-panel" data-testid="history-category-chart" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Typography component="h2" sx={{ mb: 1.5 }} variant="h6">
          カテゴリ別支出
        </Typography>
        {!hasData ? (
          <Typography
            color="text.secondary"
            data-testid="history-category-chart-empty"
            variant="body2"
          >
            カテゴリ別の支出データがあると表示されます
          </Typography>
        ) : (
          <Box
            aria-label="カテゴリ別支出グラフ"
            data-chart-height={chartHeight}
            role="img"
            sx={{ minWidth: 0, width: "100%" }}
          >
            <BarChart
              borderRadius={6}
              colors={[theme.palette.primary.main]}
              dataset={dataset}
              height={chartHeight}
              hideLegend
              layout="horizontal"
              margin={{ bottom: 28, left: isCompact ? 78 : 112, right: 12, top: 12 }}
              onItemClick={(_event, item) => {
                const category = topCategories[item.dataIndex];
                if (category !== undefined && category.categoryId !== HISTORY_OTHER_CATEGORY_ID) {
                  onCategorySelect?.(category.categoryId);
                }
              }}
              series={[
                {
                  dataKey: "amount",
                  label: "支出",
                  valueFormatter: (value) => formatYenCompact(value ?? 0),
                },
              ]}
              skipAnimation
              xAxis={[{ valueFormatter: (value: number | null) => formatYenCompact(value ?? 0) }]}
              yAxis={[{ dataKey: "label", scaleType: "band" }]}
            />
          </Box>
        )}
        {hasData ? (
          <Stack aria-label="カテゴリ別支出の詳細" spacing={0.5} sx={{ mt: 1 }}>
            {topCategories.map((category) => (
              <Stack
                direction="row"
                key={category.categoryId}
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="body2">{category.categoryName}</Typography>
                <Typography color="text.secondary" variant="body2">
                  {formatYen(category.totalAmountYen)}（
                  {totalAmountYen > 0
                    ? Math.round((category.totalAmountYen / totalAmountYen) * 100)
                    : 0}
                  %）
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : null}
        {hasData && onCategorySelect ? (
          <Typography color="text.secondary" variant="caption">
            棒をクリックすると、そのカテゴリで絞り込めます
            {hasOtherCategory ? "（その他を除く）" : ""}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}
