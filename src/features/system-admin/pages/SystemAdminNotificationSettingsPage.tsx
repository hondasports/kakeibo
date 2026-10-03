import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_TYPE_LABELS,
  type NotificationChannel,
} from "../../../../lib/domain/notifications/model";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../../../lib/domain/systemAdmin/reason";
import type { TransactionalEmailType } from "../../../../lib/email/model";
import { SystemAdminPageFrame } from "./SystemAdminPageFrame";

type PendingChange = {
  type: TransactionalEmailType;
  channel: NotificationChannel;
  mandatory: boolean;
  enabled: boolean;
};

export function SystemAdminNotificationSettingsPage() {
  const settings = useQuery(api.notificationSettings.getNotificationSettings);
  const updateSetting = useMutation(api.notificationSettings.updateNotificationSetting);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: "success" | "error";
    message: string;
  } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const openDialog = (change: PendingChange) => {
    setPending(change);
    setReason("");
    setConfirmed(false);
    setFeedback(null);
    setDialogError(null);
  };

  const handleSave = async () => {
    if (!pending) return;
    const reasonResult = normalizeSystemAdminReason(reason);
    if (!reasonResult.success) {
      setDialogError(getNormalizeReasonErrorMessage(reasonResult.error));
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await updateSetting({
        type: pending.type,
        channel: pending.channel,
        enabled: pending.enabled,
        reason: reasonResult.reason,
        ...(pending.mandatory && !pending.enabled ? { confirmMandatoryEmailDisable: true } : {}),
      });
      setFeedback({ severity: "success", message: "通知設定を更新しました" });
      setPending(null);
    } catch {
      setDialogError("通知設定を更新できませんでした。入力内容を確認して再試行してください");
    } finally {
      setSaving(false);
    }
  };

  const mandatoryDisable = pending !== null && pending.mandatory && !pending.enabled;

  return (
    <SystemAdminPageFrame
      description="通知種別・チャネルごとの全体設定を変更します。変更は監査ログに記録されます。"
      title="通知設定"
    >
      {feedback ? (
        <Alert severity={feedback.severity} variant="outlined">
          {feedback.message}
        </Alert>
      ) : null}
      {settings === undefined ? (
        <Stack spacing={1}>
          <Skeleton height={40} variant="rounded" />
          <Skeleton height={40} variant="rounded" />
          <Skeleton height={40} variant="rounded" />
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>通知種別</TableCell>
                <TableCell>チャネル</TableCell>
                <TableCell>分類</TableCell>
                <TableCell>状態</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {settings.items.map((item) => (
                <TableRow key={`${item.type}:${item.channel}`}>
                  <TableCell>{item.typeLabel}</TableCell>
                  <TableCell>{item.channelLabel}</TableCell>
                  <TableCell>
                    {item.mandatory ? (
                      <Chip color="warning" label="必須" size="small" variant="outlined" />
                    ) : (
                      <Chip label="任意" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={item.enabled}
                          disabled={saving}
                          onChange={(event) =>
                            openDialog({ ...item, enabled: event.target.checked })
                          }
                          slotProps={{
                            input: {
                              "aria-label": `${item.typeLabel}の${item.channelLabel}通知`,
                            },
                          }}
                        />
                      }
                      label={item.enabled ? "ON" : "OFF"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (!saving) setPending(null);
        }}
        open={pending !== null}
      >
        <DialogTitle>通知設定の変更</DialogTitle>
        <DialogContent>
          {pending ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography>
                {NOTIFICATION_TYPE_LABELS[pending.type]}（
                {NOTIFICATION_CHANNEL_LABELS[pending.channel]}）を
                {pending.enabled ? "ON" : "OFF"}にします。
              </Typography>
              {mandatoryDisable ? (
                <Alert severity="warning" variant="outlined">
                  このメールは必須通知です。OFFにするとユーザーに送信されなくなります。
                </Alert>
              ) : null}
              {dialogError ? (
                <Alert severity="error" variant="outlined">
                  {dialogError}
                </Alert>
              ) : null}
              <TextField
                autoFocus
                disabled={saving}
                fullWidth
                slotProps={{ htmlInput: { maxLength: 500 } }}
                label="変更理由（必須）"
                multiline
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
              {mandatoryDisable ? (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmed}
                      disabled={saving}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                  }
                  label="必須メールを停止することを確認しました"
                />
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setPending(null)}>
            キャンセル
          </Button>
          <Button
            disabled={saving || reason.trim().length === 0 || (mandatoryDisable && !confirmed)}
            onClick={() => void handleSave()}
            variant="contained"
          >
            {saving ? <CircularProgress size={18} /> : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
    </SystemAdminPageFrame>
  );
}
