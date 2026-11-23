import { Chip, Stack, Typography } from "@mui/material";
import type { ExpenseSearchFormState } from "../lib/searchParams";
import { describeSearchFilters, type SearchFilterChipKey } from "../lib/searchFilterLabels";

export function AppliedSearchFilters({
  state,
  categoryLabel,
  onChange,
}: {
  state: ExpenseSearchFormState;
  categoryLabel?: string;
  onChange: (state: ExpenseSearchFormState) => void;
}) {
  const removers: Record<SearchFilterChipKey, () => void> = {
    entryType: () => onChange({ ...state, entryType: "all" }),
    shopQuery: () => onChange({ ...state, shopQuery: "" }),
    categoryId: () => onChange({ ...state, categoryId: "" }),
    minAmountYen: () => onChange({ ...state, minAmountYen: "" }),
    maxAmountYen: () => onChange({ ...state, maxAmountYen: "" }),
    dateRange: () => onChange({ ...state, startDate: "", endDate: "" }),
  };
  const chips = describeSearchFilters(state, categoryLabel);

  if (chips.length === 0) {
    return null;
  }

  return (
    <Stack aria-label="適用中の絞り込み" spacing={1}>
      <Typography component="h2" variant="subtitle1">
        絞り込み中
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
        {chips.map((chip) => (
          <Chip key={chip.key} label={chip.label} onDelete={removers[chip.key]} />
        ))}
      </Stack>
    </Stack>
  );
}
