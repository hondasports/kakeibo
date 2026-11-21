import { api } from "../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Stack, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ExpenseEntryForm } from "../components/ExpenseEntryForm";
import { WeekNavigator } from "../../week";
import { WeekStatusPanel } from "../../week";
import { useInputPageWeek, WEEK_SESSION_LOAD_ERROR_MESSAGE } from "../hooks/useInputPageWeek";
import { SuzumemoLoadingState } from "../../ui";

export function InputPage() {
  const theme = useTheme();
  const isCompact = !useMediaQuery(theme.breakpoints.up("md"));
  const {
    weekStartDate,
    weekEndDate,
    weekSession,
    sessionError,
    isLoading,
    isCurrentWeek,
    goToPreviousWeek,
    goToNextWeek,
    retrySession,
  } = useInputPageWeek();

  const categories = useQuery(api.categories.queries.listActive);
  const weekSummary = useQuery(api.receipts.summaries.getWeekSummary, {
    weekStartDate,
  });

  if (isLoading && !weekSession) {
    return (
      <SuzumemoLoadingState
        label="データを読み込み中"
        message="週次セッションを準備しています…"
        variant="page"
      />
    );
  }

  if (sessionError || (!isLoading && !weekSession)) {
    return (
      <Box className="app-main">
        <Alert
          action={
            <Button color="inherit" onClick={retrySession} size="small">
              再試行
            </Button>
          }
          severity="error"
          variant="outlined"
        >
          {sessionError || WEEK_SESSION_LOAD_ERROR_MESSAGE}
        </Alert>
      </Box>
    );
  }

  return (
    <Box className="app-main" sx={{ minWidth: 0, maxWidth: "100%" }}>
      <Stack spacing={3}>
        <WeekNavigator
          compactOnMobile={isCompact}
          weekStartDate={weekStartDate}
          weekEndDate={weekEndDate}
          isCurrentWeek={isCurrentWeek}
          onPreviousWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
        />

        {weekSummary !== undefined && (
          <WeekStatusPanel
            count={weekSummary.count}
            isCurrentWeek={isCurrentWeek}
            totalAmountYen={weekSummary.totalAmountYen}
            weekStartDate={weekStartDate}
          />
        )}

        {categories === undefined ? (
          <SuzumemoLoadingState
            label="カテゴリを読み込み中"
            message="カテゴリを読み込んでいます…"
            variant="page"
          />
        ) : categories.length === 0 ? (
          <Alert
            action={
              <Button color="inherit" component={RouterLink} size="small" to="/settings">
                カテゴリ設定を開く
              </Button>
            }
            severity="info"
            variant="outlined"
          >
            カテゴリがまだ登録されていません。支出を記録するには、設定でカテゴリを追加してください。
          </Alert>
        ) : (
          <ExpenseEntryForm
            weekStartDate={weekStartDate}
            weekEndDate={weekEndDate}
            categories={categories}
          />
        )}
      </Stack>
    </Box>
  );
}
