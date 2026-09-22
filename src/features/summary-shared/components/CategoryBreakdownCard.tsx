import { Box, LinearProgress, Paper, Skeleton, Stack, Typography } from "@mui/material";
import { AnimatedCounter } from "../../ui";
import type { CategorySummary } from "../types/types";

export function CategoryBreakdownCard({
  byCategory,
  count,
  emptyMessage = "まだレシートがありません",
  isLoading,
  showPercentage = false,
  title = "カテゴリ別",
  totalAmountYen,
}: {
  byCategory: CategorySummary[];
  count: number;
  emptyMessage?: string;
  isLoading: boolean;
  showPercentage?: boolean;
  title?: string;
  totalAmountYen: number;
}) {
  return (
    <Paper className="paper-panel" elevation={0}>
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
          >
            <Typography component="h2" variant="h6">
              {title}
            </Typography>
            {showPercentage && (
              <Typography color="text.secondary" variant="body2">
                金額 (円)
              </Typography>
            )}
          </Stack>

          {isLoading ? (
            <>
              <Skeleton variant="text" height={32} />
              <Skeleton variant="text" height={32} />
              <Skeleton variant="text" height={32} />
            </>
          ) : count === 0 ? (
            <Typography color="text.secondary" variant="body2">
              {emptyMessage}
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {byCategory.map((cat) => {
                const percentage =
                  totalAmountYen > 0 ? Math.round((cat.totalAmountYen / totalAmountYen) * 100) : 0;

                return (
                  <Stack key={cat.categoryId} spacing={0.75}>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: cat.categoryColor,
                            flexShrink: 0,
                          }}
                        />
                        <Typography variant="body2">{cat.categoryName}</Typography>
                        {!showPercentage && (
                          <Typography color="text.secondary" variant="caption">
                            <AnimatedCounter value={cat.count} suffix="件" />
                          </Typography>
                        )}
                      </Stack>
                      <Typography sx={{ fontWeight: 700, flexShrink: 0 }} variant="body2">
                        {showPercentage ? (
                          <>
                            <AnimatedCounter value={cat.totalAmountYen} suffix="円" />
                            {` (${percentage}%)`}
                          </>
                        ) : (
                          <AnimatedCounter value={cat.totalAmountYen} suffix="円" />
                        )}
                      </Typography>
                    </Stack>
                    {totalAmountYen > 0 && (
                      <LinearProgress
                        aria-label={`${cat.categoryName}の割合`}
                        value={percentage}
                        variant="determinate"
                        sx={{
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: "var(--color-border-track)",
                          "& .MuiLinearProgress-bar": {
                            backgroundColor: cat.categoryColor,
                            borderRadius: 999,
                          },
                        }}
                      />
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
