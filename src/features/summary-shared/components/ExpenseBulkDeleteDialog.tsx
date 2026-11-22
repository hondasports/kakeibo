import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

export function ExpenseBulkDeleteDialog({
  open,
  saving,
  selectedCount,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  selectedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog fullWidth maxWidth="xs" onClose={saving ? undefined : onCancel} open={open}>
      <DialogTitle>明細{selectedCount}件を削除しますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          削除すると元に戻せません。今週の集計からも外れます。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onCancel} type="button">
          キャンセル
        </Button>
        <Button
          color="error"
          disabled={saving}
          onClick={onConfirm}
          type="button"
          variant="contained"
        >
          削除する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
