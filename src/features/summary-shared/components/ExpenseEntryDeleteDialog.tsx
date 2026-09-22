import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

export function ExpenseEntryDeleteDialog({
  open,
  onCancel,
  onConfirm,
  saving,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <Dialog fullWidth maxWidth="xs" onClose={onCancel} open={open}>
      <DialogTitle>この記録を削除しますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body2">削除すると今週の集計からも外れます。</Typography>
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
