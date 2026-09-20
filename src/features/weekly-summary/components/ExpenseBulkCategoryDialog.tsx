import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { hasMultipleSourceCategories } from "../utils/bulkSelection";
import type { ReceiptItem } from "../types/types";

type CategoryOption = {
  _id: string;
  name: string;
  color?: string;
};

export function ExpenseBulkCategoryDialog({
  categories,
  open,
  saving,
  selectedReceipts,
  onCancel,
  onPreviewCategory,
  onConfirm,
}: {
  categories: CategoryOption[];
  open: boolean;
  saving: boolean;
  selectedReceipts: ReceiptItem[];
  onCancel: () => void;
  onPreviewCategory: (category: CategoryOption | null) => void;
  onConfirm: (categoryId: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const selectedCategory = categories.find((category) => category._id === categoryId) ?? null;
  const mixedCategories = hasMultipleSourceCategories(selectedReceipts);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setCategoryId("");
    }
  }

  const handleCategoryChange = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    onPreviewCategory(categories.find((category) => category._id === nextCategoryId) ?? null);
  };

  const handleCancel = () => {
    onPreviewCategory(null);
    onCancel();
  };

  return (
    <Dialog fullWidth maxWidth="xs" onClose={saving ? undefined : handleCancel} open={open}>
      <DialogTitle>明細のカテゴリを変更</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            明細{selectedReceipts.length}件を
            {selectedCategory ? `「${selectedCategory.name}」` : "選択したカテゴリ"}へ変更します。
          </Typography>
          {mixedCategories && (
            <Alert severity="info" variant="outlined">
              いま選んでいる明細は複数のカテゴリに分かれています。変更すると1つのカテゴリにまとまります。
            </Alert>
          )}
          <TextField
            disabled={saving}
            fullWidth
            label="変更後のカテゴリ"
            onChange={(event) => handleCategoryChange(event.target.value)}
            select
            value={categoryId}
          >
            {categories.map((category) => (
              <MenuItem key={category._id} value={category._id}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={handleCancel} type="button">
          キャンセル
        </Button>
        <Button
          disabled={saving || !categoryId}
          onClick={() => onConfirm(categoryId)}
          type="button"
          variant="contained"
        >
          変更する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
