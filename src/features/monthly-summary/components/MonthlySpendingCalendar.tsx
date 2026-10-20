import { alpha } from "@mui/material/styles";
import { Box, ButtonBase, Paper, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import { formatJapaneseDate } from "../../../utils/date";
import { formatYen, formatYenCompact } from "../../../../lib/domain/common/currency";
import { formatMonthLabel } from "../lib/monthNavigation";
import {
  buildMonthlySpendingCalendarData,
  CALENDAR_WEEKDAY_LABELS,
  getExpenseIntensity,
  type MonthlyCalendarDay,
} from "../utils/monthlySpendingCalendar";

type CalendarEntry = {
  date: string;
  amountYen: number;
};

const EXPENSE_INTENSITY_ALPHA = [0, 0.1, 0.22, 0.38, 0.58] as const;

function LegendItem({
  backgroundColor,
  borderColor,
  label,
}: {
  backgroundColor: string;
  borderColor?: string;
  label: string;
}) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box
        aria-hidden
        sx={{
          backgroundColor,
          border: borderColor ? `2px solid ${borderColor}` : undefined,
          borderRadius: 1,
          height: 14,
          width: 14,
        }}
      />
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
    </Stack>
  );
}

function getDayLabel(day: MonthlyCalendarDay): string {
  const expenseLabel = day.expenseAmountYen > 0 ? formatYen(day.expenseAmountYen) : "なし";
  const incomeLabel = day.incomeAmountYen > 0 ? formatYen(day.incomeAmountYen) : "なし";
  return `${formatJapaneseDate(day.date)}、支出${expenseLabel}、収入${incomeLabel}`;
}

function getCellBackgroundColor(intensity: number, primaryColor: string): string {
  return intensity === 0
    ? "var(--color-surface-panel)"
    : alpha(primaryColor, EXPENSE_INTENSITY_ALPHA[intensity]);
}

export function MonthlySpendingCalendar({
  expenses,
  incomes,
  isLoading = false,
  month,
  onDateSelect,
  selectedDate,
}: {
  expenses: CalendarEntry[];
  incomes: CalendarEntry[];
  isLoading?: boolean;
  month: string;
  onDateSelect: (date: string) => void;
  selectedDate?: string | null;
}) {
  const theme = useTheme();
  const calendar = buildMonthlySpendingCalendarData({ expenses, incomes, month });
  const monthLabel = formatMonthLabel(month);

  return (
    <Paper className="paper-panel monthly-spending-calendar" elevation={0}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 2 }}
            sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
          >
            <Stack spacing={0.25}>
              <Typography component="h2" variant="h6">
                支出カレンダー
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {monthLabel}の支出日を色の濃さで確認できます
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
              <LegendItem
                backgroundColor={alpha(theme.palette.primary.main, 0.38)}
                label="支出額の濃さ"
              />
              <LegendItem
                backgroundColor={alpha(theme.palette.success.main, 0.2)}
                borderColor={theme.palette.success.main}
                label="収入あり"
              />
            </Stack>
          </Stack>

          {isLoading ? (
            <Skeleton
              data-testid="monthly-spending-calendar-loading"
              height={280}
              variant="rounded"
            />
          ) : (
            <Box
              aria-label={`${monthLabel}の支出カレンダー`}
              role="grid"
              sx={{ display: "grid", gap: 0.75, minWidth: 0 }}
            >
              <Box
                role="row"
                sx={{
                  display: "grid",
                  gap: 0.75,
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                }}
              >
                {CALENDAR_WEEKDAY_LABELS.map((label) => (
                  <Typography
                    align="center"
                    color={
                      label === "日"
                        ? "error.main"
                        : label === "土"
                          ? "primary.main"
                          : "text.secondary"
                    }
                    component="span"
                    key={label}
                    role="columnheader"
                    sx={{ fontWeight: 700, py: 0.25 }}
                    variant="caption"
                  >
                    {label}
                  </Typography>
                ))}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gap: 0.75,
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                }}
              >
                {calendar.cells.map((day, index) => {
                  if (day === null) {
                    return (
                      <Box
                        aria-hidden
                        key={`empty-${index}`}
                        sx={{ minHeight: { xs: 68, sm: 78 } }}
                      />
                    );
                  }

                  const intensity = getExpenseIntensity(
                    day.expenseAmountYen,
                    calendar.maxExpenseAmountYen,
                  );
                  const hasIncome = day.incomeAmountYen > 0;
                  const isSelected = selectedDate === day.date;

                  return (
                    <ButtonBase
                      aria-label={getDayLabel(day)}
                      aria-pressed={isSelected}
                      data-date={day.date}
                      data-expense-intensity={intensity}
                      data-has-income={hasIncome}
                      key={day.date}
                      onClick={() => onDateSelect(day.date)}
                      sx={{
                        alignItems: "stretch",
                        backgroundColor: getCellBackgroundColor(
                          intensity,
                          theme.palette.primary.main,
                        ),
                        border: isSelected
                          ? `2px solid ${theme.palette.secondary.main}`
                          : "1px solid",
                        borderColor: isSelected ? "secondary.main" : "divider",
                        borderRadius: 1.5,
                        color: intensity >= 4 ? "primary.contrastText" : "text.primary",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        minHeight: { xs: 68, sm: 78 },
                        minWidth: 0,
                        overflow: "hidden",
                        p: { xs: 0.75, sm: 1 },
                        textAlign: "left",
                        transition: "border-color 120ms ease, box-shadow 120ms ease",
                        width: "100%",
                        "&:hover, &:focus-visible": {
                          borderColor: "secondary.main",
                          boxShadow: `0 0 0 2px ${alpha(theme.palette.secondary.main, 0.18)}`,
                        },
                      }}
                      type="button"
                    >
                      <Typography
                        component="span"
                        sx={{ fontWeight: 700, lineHeight: 1.1 }}
                        variant="body2"
                      >
                        {day.dayOfMonth}
                      </Typography>
                      <Typography
                        component="span"
                        noWrap
                        sx={{
                          fontSize: { xs: "0.62rem", sm: "0.7rem" },
                          fontVariantNumeric: "tabular-nums",
                          mt: 0.5,
                          opacity: day.expenseAmountYen > 0 ? 1 : 0.55,
                          width: "100%",
                        }}
                      >
                        {day.expenseAmountYen > 0
                          ? formatYenCompact(day.expenseAmountYen)
                          : "支出なし"}
                      </Typography>
                      {hasIncome && (
                        <Stack
                          direction="row"
                          spacing={0.35}
                          sx={{ alignItems: "center", mt: "auto", minWidth: 0, width: "100%" }}
                        >
                          <Box
                            aria-hidden
                            sx={{
                              backgroundColor: "success.main",
                              borderRadius: "50%",
                              flexShrink: 0,
                              height: 6,
                              width: 6,
                            }}
                          />
                          <Typography
                            component="span"
                            noWrap
                            sx={{
                              color: intensity >= 4 ? "inherit" : "success.dark",
                              fontSize: { xs: "0.6rem", sm: "0.68rem" },
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 700,
                            }}
                          >
                            {formatYenCompact(day.incomeAmountYen)}
                          </Typography>
                        </Stack>
                      )}
                    </ButtonBase>
                  );
                })}
              </Box>
            </Box>
          )}

          <Typography color="text.secondary" variant="caption">
            日付をタップすると、その日の支出・収入一覧を表示します。収入は緑の印で区別しています。
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}
