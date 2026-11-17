import { useRef } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, Button, Stack } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { formatMonthLabel, normalizeMonth } from "../lib/monthNavigation";

type MonthNavigatorProps = {
  month: string;
  currentMonth: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  onMonthChange: (month: string) => void;
};

export function MonthNavigator({
  month,
  currentMonth,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onMonthChange,
}: MonthNavigatorProps) {
  const pickerView = useRef<"year" | "month">("month");
  const normalizedMonth = normalizeMonth(month);
  const normalizedCurrentMonth = normalizeMonth(currentMonth);
  const monthLabel = normalizedMonth ? formatMonthLabel(normalizedMonth) : "年月";
  // MUI 既定の「日付を選択してください…」は日付の選択を指すため、月を選ぶ操作だと分かる名前にする。
  const pickerButtonLabel = normalizedMonth
    ? `表示する月を選ぶ（現在: ${monthLabel}）`
    : "表示する月を選ぶ";

  const handlePickerChange = (value: Dayjs | null) => {
    if (value === null || !value.isValid() || pickerView.current !== "month") {
      return;
    }
    onMonthChange(value.format("YYYY-MM"));
  };

  return (
    <Stack
      className="month-navigator"
      direction="row"
      spacing={{ xs: 0.5, sm: 1.5 }}
      sx={{ alignItems: "center", justifyContent: "space-between" }}
    >
      <Button
        aria-label="前月へ"
        onClick={onPreviousMonth}
        startIcon={<ChevronLeftIcon />}
        sx={{ minWidth: { xs: 44, sm: 112 }, px: { xs: 1, sm: 2 } }}
        variant="outlined"
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          前月
        </Box>
      </Button>

      <DatePicker
        format="YYYY年M月"
        maxDate={normalizedCurrentMonth ? dayjs(`${normalizedCurrentMonth}-01`) : undefined}
        onChange={handlePickerChange}
        openTo="month"
        slotProps={{
          field: {
            "aria-label": `${monthLabel}を選択`,
          },
          openPickerButton: {
            "aria-label": pickerButtonLabel,
          },
          textField: {
            sx: {
              minWidth: { xs: 148, sm: 172 },
              "& .MuiInputBase-root": {
                backgroundColor: "background.paper",
              },
            },
          },
          popper: {
            sx: {
              "& .MuiPaper-root": {
                border: "1px solid",
                borderColor: "divider",
              },
            },
          },
        }}
        value={normalizedMonth ? dayjs(`${normalizedMonth}-01`) : null}
        views={["year", "month"]}
        onViewChange={(view) => {
          if (view === "year" || view === "month") {
            pickerView.current = view;
          }
        }}
      />

      <Button
        aria-label="今月へ"
        disabled={month === currentMonth}
        onClick={onCurrentMonth}
        sx={{ minWidth: { xs: 44, sm: 80 }, px: { xs: 1, sm: 2 } }}
        variant="outlined"
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          今月
        </Box>
      </Button>

      <Button
        aria-label="次月へ"
        disabled={month === currentMonth}
        endIcon={<ChevronRightIcon />}
        onClick={onNextMonth}
        sx={{ minWidth: { xs: 44, sm: 112 }, px: { xs: 1, sm: 2 } }}
        variant="outlined"
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          次月
        </Box>
      </Button>
    </Stack>
  );
}
