import DeleteIcon from "@mui/icons-material/Delete";
import { Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import { currencyFormatter } from "../../../../lib/domain/common/currency";
import { CategoryGrid } from "./CategoryGrid";
import type {
  ExpenseEntryCategory,
  ExpenseEntryItem,
  ExpenseEntryItemErrors,
} from "../types/types";

export function ExpenseItemRow({
  index,
  item,
  itemErrors,
  categories,
  onItemChange,
  onRemove,
  canRemove,
}: {
  index: number;
  item: ExpenseEntryItem;
  itemErrors: ExpenseEntryItemErrors;
  categories: ExpenseEntryCategory[];
  onItemChange: (field: keyof ExpenseEntryItem, value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <Box
      data-testid={`expense-item-${index}`}
      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography variant="caption" color="text.secondary">
            項目 {index + 1}
          </Typography>
          {canRemove && (
            <IconButton aria-label="削除" size="small" color="error" onClick={onRemove}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>

        <TextField
          fullWidth
          size="small"
          id={`item-title-${index}`}
          label="内容"
          slotProps={{ htmlInput: { "aria-label": "内容" } }}
          value={item.title}
          onChange={(event) => onItemChange("title", event.target.value)}
          error={!!itemErrors.title}
          helperText={itemErrors.title}
        />

        <TextField
          fullWidth
          size="small"
          id={`item-amount-${index}`}
          label="金額"
          slotProps={{ htmlInput: { "aria-label": "金額", inputMode: "numeric" } }}
          value={item.amountYen ? currencyFormatter.format(Number(item.amountYen)) : ""}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^\d]/g, "");
            onItemChange("amountYen", digits);
          }}
          error={!!itemErrors.amountYen}
          helperText={itemErrors.amountYen}
          placeholder="例: 2,000"
        />

        {itemErrors.categoryId && (
          <Typography color="error" variant="caption">
            {itemErrors.categoryId}
          </Typography>
        )}
        <CategoryGrid
          ariaLabel={`項目${index + 1}のカテゴリ候補`}
          categories={categories}
          compact
          selectedCategoryId={item.categoryId}
          onSelect={(categoryId) => onItemChange("categoryId", categoryId)}
        />
      </Stack>
    </Box>
  );
}
