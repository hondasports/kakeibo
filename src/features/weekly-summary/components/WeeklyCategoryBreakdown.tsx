import { Box, Paper, Skeleton, Typography } from "@mui/material";
import type { CategorySummary } from "../../summary-shared/types/types";
import { formatYen } from "../../../utils/currency";

export function WeeklyCategoryBreakdown({
  byCategory,
  count,
  isLoading,
  totalAmountYen,
}: {
  byCategory: CategorySummary[];
  count: number;
  isLoading: boolean;
  totalAmountYen: number;
}) {
  return (
    <Paper
      className="paper-panel weekly-category-panel"
      data-testid="weekly-category-breakdown"
      elevation={0}
    >
      <Typography component="h2" variant="h6">
        カテゴリ別
      </Typography>
      {isLoading ? (
        <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </Box>
      ) : count === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 2 }} variant="body2">
          まだ支出がありません
        </Typography>
      ) : (
        <Box aria-label="カテゴリ別内訳" className="weekly-category-breakdown" role="table">
          <Box className="weekly-category-header" role="row">
            <Typography role="columnheader" variant="caption">
              カテゴリ
            </Typography>
            <Typography role="columnheader" variant="caption">
              金額（円）
            </Typography>
            <Typography role="columnheader" variant="caption">
              割合
            </Typography>
            <Typography role="columnheader" variant="caption">
              件数
            </Typography>
          </Box>
          {byCategory.map((category) => {
            const percentage =
              totalAmountYen > 0 ? Math.round((category.totalAmountYen / totalAmountYen) * 100) : 0;
            return (
              <Box className="weekly-category-row" key={category.categoryId} role="row">
                <Box className="weekly-category-name" role="cell">
                  <Box
                    aria-hidden
                    className="weekly-category-dot"
                    sx={{ backgroundColor: category.categoryColor }}
                  />
                  <Typography variant="body2">{category.categoryName}</Typography>
                </Box>
                <Typography role="cell" variant="body2">
                  {formatYen(category.totalAmountYen)}
                </Typography>
                <Typography role="cell" variant="body2">
                  {percentage}%
                </Typography>
                <Typography role="cell" variant="body2">
                  {category.count}件
                </Typography>
              </Box>
            );
          })}
          <Box className="weekly-category-row weekly-category-total" role="row">
            <Typography role="cell" sx={{ fontWeight: 700 }} variant="body2">
              合計
            </Typography>
            <Typography role="cell" sx={{ fontWeight: 700 }} variant="body2">
              {formatYen(totalAmountYen)}
            </Typography>
            <Typography role="cell" sx={{ fontWeight: 700 }} variant="body2">
              100%
            </Typography>
            <Typography role="cell" sx={{ fontWeight: 700 }} variant="body2">
              {count}件
            </Typography>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
