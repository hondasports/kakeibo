import {
  getNormalizeReasonErrorMessage,
  MAX_REASON_LENGTH,
  normalizeSystemAdminReason,
} from "../../../../lib/domain/systemAdmin/reason";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { GroupDetailMember } from "../hooks/useSystemAdminGroupDetail";

type GroupOwnerlessRecoveryDialogProps = {
  open: boolean;
  group: { id: string; name: string };
  target: GroupDetailMember | null;
  reason: string;
  recovering: boolean;
  error: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function GroupOwnerlessRecoveryDialog({
  open,
  group,
  target,
  reason,
  recovering,
  error,
  onReasonChange,
  onCancel,
  onConfirm,
}: GroupOwnerlessRecoveryDialogProps) {
  const trimmed = reason.trim();
  const reasonResult = normalizeSystemAdminReason(reason);
  const reasonError = reasonResult.success
    ? ""
    : getNormalizeReasonErrorMessage(reasonResult.error);

  return (
    <Dialog fullWidth maxWidth="sm" onClose={recovering ? undefined : onCancel} open={open}>
      <DialogTitle>owner不在を復旧</DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ pt: 1 }}>
          <Typography>
            グループ: {group.name}（{group.id}）
          </Typography>
          <Typography>
            対象: {target?.displayName ?? "ユーザー"}（{target?.email ?? "email未登録"}）
          </Typography>
          <Typography color="error">owner 0人を確認し、このmemberをownerへ昇格します。</Typography>
          <TextField
            error={Boolean(reasonError)}
            helperText={reasonError || `${trimmed.length}/${MAX_REASON_LENGTH}文字（必須）`}
            label="復旧理由"
            multiline
            minRows={3}
            name="ownerless-recovery-reason"
            onChange={(event) => onReasonChange(event.target.value)}
            value={reason}
          />
          {error ? (
            <Alert aria-live="polite" severity="error">
              {error}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={recovering} onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          disabled={recovering || !reasonResult.success || !target?.userDocumentId}
          onClick={() => void onConfirm()}
          variant="contained"
        >
          {recovering ? "復旧中…" : "復旧する"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
