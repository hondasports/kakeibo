import { Stack, TextField, Typography } from "@mui/material";
import { currencyFormatter } from "../../../../lib/domain/common/currency";
import { CategoryGrid } from "./CategoryGrid";
import type { ExpenseEntryCategory } from "../types/types";

interface SingleEntryFieldsProps {
  categories: ExpenseEntryCategory[];
  itemCategoryId?: string;
  memo: string;
  shopName: string;
  shopNameError: string;
  sourceAmount: string;
  sourceAmountError: string;
  categoryError?: string;
  onShopNameChange: (value: string) => void;
  onSourceAmountChange: (value: string) => void;
  onItemChange: (field: "categoryId" | "memo", value: string) => void;
}

export function SingleEntryFields({
  categories,
  itemCategoryId,
  memo,
  shopName,
  shopNameError,
  sourceAmount,
  sourceAmountError,
  categoryError,
  onShopNameChange,
  onSourceAmountChange,
  onItemChange,
}: SingleEntryFieldsProps) {
  return (
    <>
      <TextField
        error={!!shopNameError}
        fullWidth
        helperText={shopNameError}
        id="expense-shop-name"
        label="店舗名 / 支払先"
        slotProps={{ htmlInput: { "aria-label": "店舗名 / 支払先" } }}
        onChange={(event) => onShopNameChange(event.target.value)}
        placeholder="例: スーパー北浜"
        value={shopName}
      />

      <TextField
        error={!!sourceAmountError}
        fullWidth
        helperText={sourceAmountError}
        id="expense-source-amount"
        label="合計金額"
        slotProps={{ htmlInput: { "aria-label": "合計金額", inputMode: "numeric" } }}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, "");
          onSourceAmountChange(digits);
        }}
        placeholder="例: 4,280"
        value={sourceAmount ? currencyFormatter.format(parseInt(sourceAmount, 10)) : ""}
      />

      <Stack spacing={1}>
        <Typography component="p" variant="body2" sx={{ fontWeight: 700 }}>
          カテゴリ
        </Typography>
        {categoryError && (
          <Typography color="error" variant="caption">
            {categoryError}
          </Typography>
        )}
        <CategoryGrid
          ariaLabel="カテゴリ候補"
          categories={categories}
          selectedCategoryId={itemCategoryId}
          onSelect={(categoryId) => onItemChange("categoryId", categoryId)}
        />
      </Stack>

      <TextField
        fullWidth
        id="expense-memo"
        label="メモ（任意）"
        minRows={2}
        multiline
        onChange={(event) => onItemChange("memo", event.target.value)}
        value={memo}
        slotProps={{ htmlInput: { "aria-label": "メモ" } }}
      />
    </>
  );
}
