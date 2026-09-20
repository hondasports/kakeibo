import { useMemo, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type Props = {
  open: boolean;
  group: { id: string; name: string };
  invitation: { id: string; email: string; createdAt: number } | null;
  confirming: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function SystemAdminInvitationRevokeDialog({
  open,
  group,
  invitation,
  confirming,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const contextKey = `${open}:${invitation?.id ?? ""}`;
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  if (prevContextKey !== contextKey) {
    setPrevContextKey(contextKey);
    if (open) setReason("");
  }
  const normalizedReason = reason.trim();
  const reasonError = useMemo(
    () =>
      normalizedReason.length < 1 || normalizedReason.length > 500
        ? "理由は1〜500文字で入力してください"
        : "",
    [normalizedReason],
  );

  return (
    <Dialog fullWidth maxWidth="sm" onClose={confirming ? undefined : onCancel} open={open}>
      <DialogTitle>pending招待を取り消す</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>
            対象group: {group.name}（{group.id}）
          </Typography>
          <Typography>
            招待先: {invitation?.email ?? "不明"}
            <br />
            作成日時: {invitation ? new Date(invitation.createdAt).toLocaleString("ja-JP") : "不明"}
          </Typography>
          <Typography color="warning.main" variant="body2">
            招待だけを取り消します。ユーザー、所属、家計データは変更しません。
          </Typography>
          <TextField
            autoFocus
            disabled={confirming}
            error={Boolean(reasonError)}
            fullWidth
            helperText={reasonError || "監査目的の理由を入力してください"}
            label="操作理由"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
          <Typography aria-live="polite" color="text.secondary" variant="caption">
            {normalizedReason.length}/500文字
          </Typography>
          {error ? (
            <Typography color="error" role="alert" variant="body2">
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={confirming} onClick={onCancel}>
          戻る
        </Button>
        <Button
          color="error"
          disabled={confirming || Boolean(reasonError) || !invitation}
          onClick={() => onConfirm(normalizedReason)}
          startIcon={confirming ? <CircularProgress color="inherit" size={16} /> : undefined}
          variant="contained"
        >
          取り消す
        </Button>
      </DialogActions>
    </Dialog>
  );
}
