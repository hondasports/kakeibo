import {
  Button,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import {
  getHistoryDatePresetForRange,
  getHistoryDateRangeForPreset,
  type HistoryDatePreset,
} from "../../../../lib/domain/expenseSearch/datePresets";
import type { HistoryEntryType } from "../../../../lib/domain/expenseSearch/filter";
import type { ExpenseSearchFormState } from "../lib/searchParams";
import { extractAmountDigits } from "../../../utils/currency";

type CategoryOption = {
  _id: string;
  name: string;
};

const pickerPaperSx = {
  "& .MuiPaper-root": {
    border: "1px solid",
    borderColor: "divider",
  },
} as const;

const datePresetOptions: Array<{ label: string; value: Exclude<HistoryDatePreset, "custom"> }> = [
  { label: "今週", value: "thisWeek" },
  { label: "今月", value: "thisMonth" },
  { label: "先月", value: "lastMonth" },
  { label: "直近3か月", value: "last3Months" },
  { label: "今年", value: "thisYear" },
];

function dateFromIso(value: string): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

function isoFromDate(value: Dayjs | null): string {
  return value?.isValid() ? value.format("YYYY-MM-DD") : "";
}

export function ExpenseSearchFilters({
  categories,
  state,
  onChange,
  onClear,
  onSubmit,
  weekStartDay,
}: {
  categories: CategoryOption[];
  state: ExpenseSearchFormState;
  onChange: (state: ExpenseSearchFormState) => void;
  onClear: () => void;
  onSubmit: () => void;
  weekStartDay?: number;
}) {
  const hasFilter =
    state.entryType !== "all" ||
    [
      state.shopQuery,
      state.categoryId,
      state.minAmountYen,
      state.maxAmountYen,
      state.startDate,
      state.endDate,
    ].some((value) => value.length > 0);
  const selectedPreset =
    state.startDate && state.endDate
      ? getHistoryDatePresetForRange(
          { startDate: state.startDate, endDate: state.endDate },
          undefined,
          weekStartDay,
        )
      : "custom";

  const handlePresetChange = (preset: Exclude<HistoryDatePreset, "custom">) => {
    const range = getHistoryDateRangeForPreset(preset, undefined, weekStartDay);
    onChange({ ...state, startDate: range.startDate, endDate: range.endDate });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Stack spacing={2}>
        <Stack spacing={1}>
          <Typography component="h2" variant="subtitle1">
            記録種別
          </Typography>
          <ToggleButtonGroup
            aria-label="記録種別"
            exclusive
            onChange={(_event, value: HistoryEntryType | null) => {
              if (value !== null) {
                onChange({
                  ...state,
                  entryType: value,
                  categoryId: value === "income" ? "" : state.categoryId,
                });
              }
            }}
            value={state.entryType}
          >
            <ToggleButton sx={{ minHeight: 44 }} value="all">
              すべて
            </ToggleButton>
            <ToggleButton sx={{ minHeight: 44 }} value="expense">
              支出
            </ToggleButton>
            <ToggleButton sx={{ minHeight: 44 }} value="income">
              収入
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            fullWidth
            label="キーワード"
            name="shopQuery"
            placeholder="店名・内容・メモ"
            value={state.shopQuery}
            onChange={(event) => onChange({ ...state, shopQuery: event.target.value })}
          />
          <TextField
            fullWidth
            disabled={state.entryType === "income"}
            helperText={
              state.entryType === "income" ? "カテゴリは支出にのみ適用されます" : undefined
            }
            select
            label="カテゴリ"
            name="categoryId"
            value={state.categoryId}
            onChange={(event) => onChange({ ...state, categoryId: event.target.value })}
          >
            <MenuItem value="">指定なし</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category._id} value={category._id}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack spacing={1}>
          <Typography component="h2" variant="subtitle1">
            期間
          </Typography>
          <Stack
            aria-label="期間プリセット"
            direction="row"
            spacing={1}
            sx={{ flexWrap: "wrap" }}
            useFlexGap
          >
            {datePresetOptions.map((option) => (
              <Button
                key={option.value}
                onClick={() => handlePresetChange(option.value)}
                sx={{ minHeight: 44 }}
                variant={selectedPreset === option.value ? "contained" : "outlined"}
              >
                {option.label}
              </Button>
            ))}
            <Button
              onClick={() => onChange({ ...state, startDate: "", endDate: "" })}
              sx={{ minHeight: 44 }}
              variant={selectedPreset === "custom" ? "contained" : "outlined"}
            >
              期間指定
            </Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            fullWidth
            label="金額の下限"
            name="minAmountYen"
            slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
            value={state.minAmountYen}
            onChange={(event) =>
              onChange({ ...state, minAmountYen: extractAmountDigits(event.target.value) })
            }
          />
          <TextField
            fullWidth
            label="金額の上限"
            name="maxAmountYen"
            slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
            value={state.maxAmountYen}
            onChange={(event) =>
              onChange({ ...state, maxAmountYen: extractAmountDigits(event.target.value) })
            }
          />
          <DatePicker
            format="YYYY/MM/DD"
            label="開始日"
            name="startDate"
            onChange={(value) => onChange({ ...state, startDate: isoFromDate(value) })}
            slotProps={{
              field: { clearable: true },
              openPickerButton: { "aria-label": "開始日を選択" },
              popper: { sx: pickerPaperSx },
              textField: {
                fullWidth: true,
                sx: { "& .MuiInputBase-root": { backgroundColor: "background.paper" } },
              },
            }}
            value={dateFromIso(state.startDate)}
          />
          <DatePicker
            format="YYYY/MM/DD"
            label="終了日"
            name="endDate"
            onChange={(value) => onChange({ ...state, endDate: isoFromDate(value) })}
            slotProps={{
              field: { clearable: true },
              openPickerButton: { "aria-label": "終了日を選択" },
              popper: { sx: pickerPaperSx },
              textField: {
                fullWidth: true,
                sx: { "& .MuiInputBase-root": { backgroundColor: "background.paper" } },
              },
            }}
            value={dateFromIso(state.endDate)}
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained">
            絞り込む
          </Button>
          {hasFilter ? (
            <Button onClick={onClear} type="button">
              すべてクリア
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </form>
  );
}
