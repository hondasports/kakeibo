import { Link } from "react-router-dom";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { Box, Button, Paper, Skeleton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { AnimatedCounter } from "../../ui";

type DashboardInputPanelProps = {
  count: number;
  isLoading?: boolean;
  status: "draft" | "completed";
  weekStartDate: string;
};

export function DashboardInputPanel({
  count,
  isLoading = false,
  status,
  weekStartDate,
}: DashboardInputPanelProps) {
  const theme = useTheme();
  const isCompact = !useMediaQuery(theme.breakpoints.up("md"));
  const isCompleted = status === "completed";
  const primaryLabel = isCompleted
    ? "今週のサマリーを見る"
    : count === 0
      ? "支出・収入を入力する"
      : "入力を再開";
  const primaryHref = isCompleted ? `/weeks/${weekStartDate}` : "/weeks/current/input";

  if (isCompact) {
    return (
      <Paper
        className="paper-panel dashboard-input-panel dashboard-input-panel--compact"
        elevation={0}
      >
        <Box sx={{ p: 2.5 }}>
          <Stack spacing={2} sx={{ alignItems: "center" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <TaskAltIcon color="success" sx={{ fontSize: 28 }} />
              {isLoading ? (
                <Skeleton height={32} variant="text" width={140} />
              ) : (
                <Typography sx={{ fontWeight: 700 }} variant="h5">
                  <AnimatedCounter value={count} suffix=" 件入力済み" />
                </Typography>
              )}
            </Stack>
            {isLoading ? (
              <Skeleton height={44} sx={{ borderRadius: 1 }} variant="rectangular" width="100%" />
            ) : (
              <Button
                component={Link}
                fullWidth
                size="large"
                sx={{ minHeight: 44 }}
                to={primaryHref}
                variant="contained"
              >
                {primaryLabel}
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper className="paper-panel dashboard-input-panel" elevation={0}>
      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            今週の入力
          </Typography>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <TaskAltIcon color="success" sx={{ fontSize: 28 }} />
            {isLoading ? (
              <Skeleton height={40} variant="text" width={160} />
            ) : (
              <Typography sx={{ fontWeight: 700 }} variant="h4">
                <AnimatedCounter value={count} suffix=" 件入力済み" />
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.5}>
            {isLoading ? (
              <>
                <Skeleton height={44} sx={{ borderRadius: 1 }} variant="rectangular" width="100%" />
                {!isCompleted && (
                  <Skeleton
                    height={44}
                    sx={{ borderRadius: 1 }}
                    variant="rectangular"
                    width="100%"
                  />
                )}
              </>
            ) : (
              <>
                <Button
                  component={Link}
                  size="large"
                  sx={{ minHeight: 44 }}
                  to={primaryHref}
                  variant="contained"
                >
                  {primaryLabel}
                </Button>
                {!isCompleted && count > 0 && (
                  <>
                    <Button
                      component={Link}
                      size="large"
                      startIcon={<EditOutlinedIcon />}
                      sx={{ minHeight: 44 }}
                      to="/weeks/current/input"
                      variant="outlined"
                    >
                      新しく入力する
                    </Button>
                    <Typography color="text.secondary" variant="caption">
                      これまでの記録を残したまま、今週にさらに記録を追加します
                    </Typography>
                  </>
                )}
              </>
            )}
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}
