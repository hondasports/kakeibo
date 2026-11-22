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
  impactMessage = "削除すると元に戻せません。今週の集計からも外れます。",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  selectedCount: number;
  /** 削除の影響を説明する文言。呼び出し画面の期間・文脈に合わせて上書きする */
  impactMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog fullWidth maxWidth="xs" onClose={saving ? undefined : onCancel} open={open}>
      <DialogTitle>明細{selectedCount}件を削除しますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{impactMessage}</Typography>
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
