import { api } from "../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { Alert, Box, Stack } from "@mui/material";
import { ExpenseEntryForm } from "../components/ExpenseEntryForm";
import { WeekNavigator } from "../../week";
import { WeekStatusPanel } from "../../week";
import { useInputPageWeek } from "../hooks/useInputPageWeek";
import { SuzumemoLoadingState } from "../../ui";

export function InputPage() {
  const {
    weekStartDate,
    weekEndDate,
    weekSession,
    sessionError,
    isLoading,
    isCurrentWeek,
    goToPreviousWeek,
    goToNextWeek,
  } = useInputPageWeek();

  const categories = useQuery(api.categories.queries.listActive) ?? [];
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
        <Alert severity="error" variant="outlined">
          {sessionError || "週次セッションの読み込みに失敗しました。"}
        </Alert>
      </Box>
    );
  }

  return (
    <Box className="app-main" sx={{ minWidth: 0, maxWidth: "100%" }}>
      <Stack spacing={3}>
        <WeekNavigator
          weekStartDate={weekStartDate}
          weekEndDate={weekEndDate}
          isCurrentWeek={isCurrentWeek}
          onPreviousWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
        />

        {weekSummary !== undefined && <WeekStatusPanel count={weekSummary.count} />}

        <ExpenseEntryForm
          weekStartDate={weekStartDate}
          weekEndDate={weekEndDate}
          categories={categories}
        />
      </Stack>
    </Box>
  );
}
