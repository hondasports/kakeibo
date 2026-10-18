import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";

export function ConfirmDifferenceDialog({
  open,
  pendingDifference,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pendingDifference: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>未配分の差額があります</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          入力元合計との差額が{" "}
          <Typography component="span" color="warning.main" sx={{ fontWeight: 700 }}>
            {formatYen(pendingDifference)}
          </Typography>{" "}
          未配分のまま保存しますか？
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          ※ 後から支出項目を追加して配分できます
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>戻る</Button>
        <Button onClick={onConfirm} variant="contained" color="warning">
          このまま保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
