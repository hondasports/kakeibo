import { Chip, Stack, Typography } from "@mui/material";
import type { ExpenseSearchFormState } from "../lib/searchParams";
import { formatYen } from "../../../../lib/domain/common/currency";

export function AppliedSearchFilters({
  state,
  categoryName,
  onChange,
}: {
  state: ExpenseSearchFormState;
  categoryName?: string;
  onChange: (state: ExpenseSearchFormState) => void;
}) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (state.entryType !== "all") {
    chips.push({
      key: "entryType",
      label: state.entryType === "expense" ? "支出" : "収入",
      remove: () => onChange({ ...state, entryType: "all" }),
    });
  }
  if (state.shopQuery) {
    chips.push({
      key: "shopQuery",
      label: `キーワード: ${state.shopQuery}`,
      remove: () => onChange({ ...state, shopQuery: "" }),
    });
  }
  if (state.categoryId) {
    chips.push({
      key: "categoryId",
      label: `カテゴリ: ${categoryName ?? "指定"}`,
      remove: () => onChange({ ...state, categoryId: "" }),
    });
  }
  if (state.minAmountYen) {
    chips.push({
      key: "minAmountYen",
      label: `${formatYen(Number(state.minAmountYen))}以上`,
      remove: () => onChange({ ...state, minAmountYen: "" }),
    });
  }
  if (state.maxAmountYen) {
    chips.push({
      key: "maxAmountYen",
      label: `${formatYen(Number(state.maxAmountYen))}以下`,
      remove: () => onChange({ ...state, maxAmountYen: "" }),
    });
  }
  if (state.startDate || state.endDate) {
    chips.push({
      key: "dateRange",
      label: `${state.startDate || "指定なし"}〜${state.endDate || "指定なし"}`,
      remove: () => onChange({ ...state, startDate: "", endDate: "" }),
    });
  }

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
          <Chip key={chip.key} label={chip.label} onDelete={chip.remove} />
        ))}
      </Stack>
    </Stack>
  );
}
