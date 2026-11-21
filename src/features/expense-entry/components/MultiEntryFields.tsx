import { Button, Divider, Stack, Typography } from "@mui/material";
import { DifferenceDisplay } from "./DifferenceDisplay";
import { ExpenseItemRow } from "./ExpenseItemRow";
import type {
  ExpenseEntryCategory,
  ExpenseEntryItem,
  ExpenseEntryItemErrors,
} from "../types/types";

interface MultiEntryFieldsProps {
  categories: ExpenseEntryCategory[];
  difference: number | null;
  itemErrors: ExpenseEntryItemErrors[];
  items: ExpenseEntryItem[];
  sourceAmount: number;
  onAddItem: () => void;
  onItemChange: (
    index: number,
    field: "categoryId" | "amountYen" | "title" | "memo",
    value: string,
  ) => void;
  onRemoveItem: (index: number) => void;
  onExitMultiMode: () => void;
}

export function MultiEntryFields({
  categories,
  difference,
  itemErrors,
  items,
  sourceAmount,
  onAddItem,
  onItemChange,
  onRemoveItem,
  onExitMultiMode,
}: MultiEntryFieldsProps) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        支出項目
      </Typography>
      {items.map((item, index) => (
        <ExpenseItemRow
          key={index}
          index={index}
          item={item}
          itemErrors={itemErrors[index] ?? {}}
          categories={categories}
          onItemChange={(field, value) => onItemChange(index, field, value)}
          onRemove={() => onRemoveItem(index)}
          canRemove={items.length > 1}
        />
      ))}

      <Button variant="outlined" size="small" onClick={onAddItem} aria-label="項目を追加">
        + 項目を追加
      </Button>

      <Button
        variant="text"
        size="small"
        onClick={onExitMultiMode}
        aria-label="内訳をやめる"
        sx={{ alignSelf: "flex-start", minHeight: 44 }}
      >
        内訳をやめる
      </Button>

      <Divider />

      <DifferenceDisplay difference={difference} sourceAmount={sourceAmount} />
    </Stack>
  );
}
