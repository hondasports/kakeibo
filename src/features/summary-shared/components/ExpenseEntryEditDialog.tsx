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
} from "@mui/material";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ReceiptItem } from "../types/types";
import { useExpenseEntryEditDialogState } from "../hooks/useExpenseEntryEditDialogState";
import {
  DraftItemsEditor,
  DraftItemsLoader,
  type CategoryOption,
} from "./ExpenseEntryDraftItemsEditor";

export function getEditableReceiptTitle(receipt: ReceiptItem): string {
  if (receipt.type === "income") {
    return receipt.bankName ?? "";
  }
  if (receipt.recordType === "expenseEntry") {
    if (receipt.aiExpenseDraftId) {
      return receipt.receiptShopName ?? receipt.shopName ?? "";
    }
    return receipt.itemName ?? receipt.shopName ?? "";
  }
  return receipt.receiptShopName ?? receipt.shopName ?? "";
}

export function ExpenseEntryEditDialog({
  categories,
  open,
  receipt,
  onClose,
  onSaved,
}: {
  categories: CategoryOption[];
  open: boolean;
  receipt: ReceiptItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    date,
    setDate,
    amountYen,
    setAmountYen,
    categoryId,
    setCategoryId,
    title,
    setTitle,
    memo,
    setMemo,
    registrationMode,
    setRegistrationMode,
    draftItems,
    setDraftItems,
    draftItemsLoading,
    setDraftItemsLoading,
    error,
    saving,
    handleSave,
    isDraftItemsLoading,
  } = useExpenseEntryEditDialogState({ receipt, onClose, onSaved });

  const entryLabel = receipt?.type === "income" ? "収入" : "支出";
  const isIncome = receipt?.type === "income";

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      {receipt?.aiExpenseDraftId ? (
        <DraftItemsLoader
          draftId={receipt.aiExpenseDraftId as Id<"aiExpenseDrafts">}
          setDraftItems={setDraftItems}
          setDraftItemsLoading={setDraftItemsLoading}
        />
      ) : null}
      <DialogTitle>{entryLabel}を編集</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="日付"
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            type="date"
            value={date}
          />
          <TextField
            fullWidth
            label="金額"
            onChange={(event) => setAmountYen(event.target.value.replace(/[^\d]/g, ""))}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            value={amountYen}
          />
          {receipt?.aiExpenseDraftId && !isIncome ? (
            <TextField
              fullWidth
              label="登録方法"
              onChange={(event) =>
                setRegistrationMode(event.target.value as "detailed" | "totalOnly")
              }
              select
              value={registrationMode}
            >
              <MenuItem value="detailed">明細ごとに保存</MenuItem>
              <MenuItem value="totalOnly">レシート合計だけで保存</MenuItem>
            </TextField>
          ) : null}
          {receipt?.aiExpenseDraftId && registrationMode === "totalOnly" ? (
            <Alert severity="info" variant="outlined">
              この金額だけを集計します。OCRの商品明細と税内訳は集計に使われません。
            </Alert>
          ) : null}
          {receipt?.aiExpenseDraftId && registrationMode === "detailed" ? (
            <DraftItemsEditor
              categories={categories}
              categoryId={categoryId}
              draftItems={draftItems}
              draftItemsLoading={draftItemsLoading}
              setDraftItems={setDraftItems}
            />
          ) : null}
          {!isIncome && (
            <TextField
              fullWidth
              label="カテゴリ"
              onChange={(event) => setCategoryId(event.target.value)}
              select
              value={categoryId}
            >
              {categories.map((category) => (
                <MenuItem key={category._id} value={category._id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth
            label={receipt?.type === "income" ? "内容" : "タイトル"}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <TextField
            fullWidth
            label="メモ"
            minRows={2}
            multiline
            onChange={(event) => setMemo(event.target.value)}
            value={memo}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose} type="button">
          キャンセル
        </Button>
        <Button
          disabled={saving || isDraftItemsLoading}
          onClick={() => void handleSave()}
          type="button"
          variant="contained"
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
