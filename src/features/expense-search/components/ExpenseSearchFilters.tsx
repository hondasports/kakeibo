import {
  Box,
  Button,
  Collapse,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import {
  getHistoryDatePresetForRange,
  getHistoryDateRangeForPreset,
  type HistoryDatePreset,
} from "../../../../lib/domain/expenseSearch/datePresets";
import {
  UNCATEGORIZED_CATEGORY_ID,
  type HistoryEntryType,
  type HistorySortOrder,
} from "../../../../lib/domain/expenseSearch/filter";
import type { ExpenseSearchFieldErrors, ExpenseSearchFormState } from "../lib/searchParams";
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

const KEYWORD_FIELD_HELP =
  '店名・品名・銀行名・メモを部分一致で探します。空白区切りでAND、先頭「-」で除外、「"..."」でそのまま検索';
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
  errors,
  hasUnappliedChanges = false,
  onChange,
  onClear,
  onSubmit,
  weekStartDay,
}: {
  categories: CategoryOption[];
  state: ExpenseSearchFormState;
  errors?: ExpenseSearchFieldErrors;
  hasUnappliedChanges?: boolean;
  onChange: (state: ExpenseSearchFormState) => void;
  onClear: () => void;
  onSubmit: () => void;
  weekStartDay?: number;
}) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down("sm"));
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const hasDateRange = state.startDate.length > 0 || state.endDate.length > 0;
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

  const form = (
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

        <Stack spacing={1}>
          <Typography component="h2" variant="subtitle1">
            並び順
          </Typography>
          <ToggleButtonGroup
            aria-label="並び順"
            exclusive
            onChange={(_event, value: HistorySortOrder | null) => {
              if (value !== null) {
                onChange({ ...state, sortOrder: value });
              }
            }}
            value={state.sortOrder}
          >
            <ToggleButton sx={{ minHeight: 44 }} value="dateDesc">
              日付が新しい順
            </ToggleButton>
            <ToggleButton sx={{ minHeight: 44 }} value="dateAsc">
              日付が古い順
            </ToggleButton>
            <ToggleButton sx={{ minHeight: 44 }} value="amountDesc">
              金額が大きい順
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            error={errors?.shopQuery !== undefined}
            fullWidth
            helperText={errors?.shopQuery ?? KEYWORD_FIELD_HELP}
            label="キーワード"
            name="shopQuery"
            placeholder="店名・品名・銀行名・メモ"
            value={state.shopQuery}
            onChange={(event) => onChange({ ...state, shopQuery: event.target.value })}
          />
          <TextField
            fullWidth
            disabled={state.entryType === "income"}
            helperText={
              state.entryType === "income"
                ? "カテゴリは支出にのみ適用されます"
                : "明細の1つでもこのカテゴリに当たる支出が対象です"
            }
            select
            label="カテゴリ"
            name="categoryId"
            value={state.categoryId}
            onChange={(event) => onChange({ ...state, categoryId: event.target.value })}
          >
            <MenuItem value="">指定なし</MenuItem>
            <MenuItem value={UNCATEGORIZED_CATEGORY_ID}>未分類</MenuItem>
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
              variant={hasDateRange ? "outlined" : "contained"}
            >
              期間を指定しない
            </Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            error={errors?.minAmountYen !== undefined}
            fullWidth
            helperText={errors?.minAmountYen}
            label="金額の下限"
            name="minAmountYen"
            slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
            value={state.minAmountYen}
            onChange={(event) =>
              onChange({ ...state, minAmountYen: extractAmountDigits(event.target.value) })
            }
          />
          <TextField
            error={errors?.maxAmountYen !== undefined}
            fullWidth
            helperText={errors?.maxAmountYen}
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
                error: errors?.startDate !== undefined,
                fullWidth: true,
                helperText: errors?.startDate,
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
                error: errors?.endDate !== undefined,
                fullWidth: true,
                helperText: errors?.endDate,
                sx: { "& .MuiInputBase-root": { backgroundColor: "background.paper" } },
              },
            }}
            value={dateFromIso(state.endDate)}
          />
        </Stack>
        <Typography color="text.secondary" variant="caption">
          金額は、支出はレシートごとの合計、収入は1件ごとの金額で比較します
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap" }}
          useFlexGap
        >
          <Button sx={{ minHeight: 44 }} type="submit" variant="contained">
            絞り込む
          </Button>
          {hasFilter ? (
            <Button onClick={onClear} sx={{ minHeight: 44 }} type="button">
              すべてクリア
            </Button>
          ) : null}
          {hasUnappliedChanges ? (
            <Typography color="text.secondary" variant="caption">
              変更はまだ適用されていません。「絞り込む」を押すと反映されます
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </form>
  );

  if (!isCompact) {
    return form;
  }

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Button
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          sx={{ minHeight: 44 }}
          variant="outlined"
        >
          {filtersOpen ? "絞り込み条件を閉じる" : "絞り込み条件を開く"}
        </Button>
        {hasUnappliedChanges ? (
          <Typography color="text.secondary" variant="caption">
            変更はまだ適用されていません
          </Typography>
        ) : null}
      </Stack>
      <Collapse in={filtersOpen}>
        <Box sx={{ pt: 2 }}>{form}</Box>
      </Collapse>
    </Box>
  );
}
