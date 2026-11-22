import {
  Alert,
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
  impactMessage = "削除すると今週の集計からも外れます。",
  error,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
  /** 削除がサマリーに与える影響の説明。利用画面ごとに変えられる（既定は週サマリーの文言）。 */
  impactMessage?: string;
  /** 直前の削除試行の失敗メッセージ。ダイアログ内に表示する。 */
  error?: string;
}) {
  return (
    <Dialog fullWidth maxWidth="xs" onClose={onCancel} open={open}>
      <DialogTitle>この記録を削除しますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{impactMessage}</Typography>
        {error ? (
          <Alert severity="error" sx={{ mt: 1 }} variant="outlined">
            {error}
          </Alert>
        ) : null}
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
