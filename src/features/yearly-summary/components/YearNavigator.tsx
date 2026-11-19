import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, Button, Stack } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { applyPickedYear, formatYearLabel, normalizeYear } from "../lib/yearNavigation";

type YearNavigatorProps = {
  year: string;
  currentYear: string;
  onPreviousYear: () => void;
  onNextYear: () => void;
  onCurrentYear: () => void;
  onYearChange: (year: string) => void;
};

export function YearNavigator({
  year,
  currentYear,
  onPreviousYear,
  onNextYear,
  onCurrentYear,
  onYearChange,
}: YearNavigatorProps) {
  const normalizedYear = normalizeYear(year);
  const normalizedCurrentYear = normalizeYear(currentYear);
  const yearLabel = normalizedYear ? formatYearLabel(normalizedYear) : "年";
  // MUI 既定の「日付を選択してください…」は日付の選択を指すため、年を選ぶ操作だと分かる名前にする。
  const pickerButtonLabel = normalizedYear
    ? `表示する年を選ぶ（現在: ${yearLabel}）`
    : "表示する年を選ぶ";

  const handlePickerChange = (value: Dayjs | null) => {
    applyPickedYear(value, onYearChange);
  };

  return (
    <Stack
      className="year-navigator"
      direction="row"
      spacing={{ xs: 0.5, sm: 1.5 }}
      sx={{ alignItems: "center", justifyContent: "space-between" }}
    >
      <Button
        aria-label="前年へ"
        onClick={onPreviousYear}
        startIcon={<ChevronLeftIcon />}
        sx={{ minWidth: { xs: 44, sm: 112 }, px: { xs: 1, sm: 2 } }}
        variant="outlined"
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          前年
        </Box>
      </Button>

      <DatePicker
        format="YYYY年"
        maxDate={normalizedCurrentYear ? dayjs(`${normalizedCurrentYear}-01-01`) : undefined}
        onChange={handlePickerChange}
        openTo="year"
        slotProps={{
          field: {
            "aria-label": `${yearLabel}を選択`,
          },
          openPickerButton: {
            "aria-label": pickerButtonLabel,
          },
          textField: {
            sx: {
              minWidth: { xs: 120, sm: 140 },
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
        value={normalizedYear ? dayjs(`${normalizedYear}-01-01`) : null}
        views={["year"]}
      />

      <Button
        aria-label="今年へ"
        disabled={year === currentYear}
        onClick={onCurrentYear}
        sx={{ minWidth: { xs: 44, sm: 80 }, px: { xs: 1, sm: 2 } }}
        variant="outlined"
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          今年
        </Box>
      </Button>

      <Button
        aria-label="次年へ"
        disabled={year === currentYear}
        endIcon={<ChevronRightIcon />}
        onClick={onNextYear}
        sx={{ minWidth: { xs: 44, sm: 112 }, px: { xs: 1, sm: 2 } }}
        variant="outlined"
      >
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          次年
        </Box>
      </Button>
    </Stack>
  );
}
