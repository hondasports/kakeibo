import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

export function ExitMultiModeDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>内訳をやめますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          単一項目の入力に戻ります。店舗名・日付・メモは引き継がれ、金額には入力済みの明細の合計が入ります。
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          入力済みの明細の内訳（カテゴリ・内容・金額）は破棄されます。
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>キャンセル</Button>
        <Button onClick={onConfirm} variant="contained" color="warning">
          内訳をやめる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
