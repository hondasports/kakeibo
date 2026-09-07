import { Autocomplete, MenuItem, TextField, Typography } from "@mui/material";
import type { AiExpenseQueueCategory, ReviewItemValues } from "../../types/types";
import { isDiscountLine } from "../../utils/discountItems";

export type ReviewItemCategoryControlProps = {
  item: ReviewItemValues;
  disabled?: boolean;
  categories: AiExpenseQueueCategory[];
  categoryName: string | undefined;
  productItems: ReviewItemValues[];
  isCategorySplit: boolean;
  onAssignCategoryToItems: (itemIds: string[], categoryId: string) => void;
  onDiscountTargetChange: (discountItemId: string, targetItemId: string) => void;
};

export function ReviewItemCategoryControl({
  item,
  disabled = false,
  categories,
  categoryName,
  productItems,
  isCategorySplit,
  onAssignCategoryToItems,
  onDiscountTargetChange,
}: ReviewItemCategoryControlProps) {
  const discount = isDiscountLine(item.itemName, item.lineType);

  if (discount) {
    return (
      <TextField
        disabled={disabled}
        fullWidth
        helperText={item.discountTargetItemId ? undefined : "対象商品を選択してください"}
        label="割引対象の商品"
        error={!item.discountTargetItemId}
        onChange={(event) => onDiscountTargetChange(item.id, event.target.value)}
        select
        value={item.discountTargetItemId ?? ""}
      >
        <MenuItem value="">割引対象を選択</MenuItem>
        {productItems.map((product) => (
          <MenuItem key={product.id} value={product.id}>
            {product.itemName}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (isCategorySplit) {
    return (
      <Autocomplete
        disabled={disabled}
        fullWidth
        getOptionLabel={(category) => category.name}
        isOptionEqualToValue={(option, value) => option._id === value._id}
        onChange={(_, category) => onAssignCategoryToItems([item.id], category?._id ?? "")}
        options={categories}
        renderInput={(params) => (
          <TextField {...params} label="明細カテゴリ" error={!item.categoryId} />
        )}
        value={categories.find((category) => category._id === item.categoryId) ?? null}
      />
    );
  }

  return (
    <Typography color="text.secondary" variant="body2">
      {item.usesReceiptCategory
        ? `カテゴリ：レシート全体（${categoryName ?? "未分類"}）`
        : `カテゴリ：${categoryName ?? "未分類"}`}
    </Typography>
  );
}
