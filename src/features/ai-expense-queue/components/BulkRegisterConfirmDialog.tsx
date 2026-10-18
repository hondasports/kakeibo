import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";

export function BulkRegisterConfirmDialog({
  confirmDisabled = false,
  count,
  open,
  totalAmountYen,
  onCancel,
  onConfirm,
}: {
  confirmDisabled?: boolean;
  count: number;
  open: boolean;
  totalAmountYen: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog fullWidth maxWidth="xs" onClose={onCancel} open={open}>
      <DialogTitle>{count}件の下書きを登録しますか？</DialogTitle>
      <DialogContent>
        <Typography variant="body1">合計 {formatYen(totalAmountYen)}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} type="button">
          キャンセル
        </Button>
        <Button disabled={confirmDisabled} onClick={onConfirm} type="button" variant="contained">
          登録する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
