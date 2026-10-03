import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { NOTIFICATION_CATALOG } from "../../../../lib/domain/notifications/model";
import { SettingsSectionErrorBoundary } from "./SettingsSectionErrorBoundary";

const mandatoryEmailNotifications = NOTIFICATION_CATALOG.filter((entry) => entry.mandatory);

type Channel = "email" | "line";

export function NotificationSettingsPanel() {
  return (
    <Box id="notifications">
      <Typography component="h2" variant="h6">
        通知設定
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
        AIレビューの通知をどこで受け取るか設定できます。
      </Typography>
      <SettingsSectionErrorBoundary>
        <NotificationSettingsContent />
      </SettingsSectionErrorBoundary>
    </Box>
  );
}

function NotificationSettingsContent() {
  const settings = useQuery(api.notifications.queries.getMyNotificationSettings);
  const updatePreference = useMutation(api.notifications.mutations.updateMyNotificationPreference);
  const [savingChannel, setSavingChannel] = useState<Channel | null>(null);
  const [feedback, setFeedback] = useState<{
    channel: Channel;
    severity: "success" | "error";
    message: string;
  } | null>(null);

  const handleToggle = async (channel: Channel, enabled: boolean) => {
    setSavingChannel(channel);
    setFeedback(null);
    try {
      await updatePreference({ type: "ai_review_required", channel, enabled });
      setFeedback({ channel, severity: "success", message: "通知設定を保存しました" });
    } catch {
      setFeedback({
        channel,
        severity: "error",
        message: "通知設定を保存できませんでした。もう一度お試しください",
      });
    } finally {
      setSavingChannel(null);
    }
  };

  if (settings === undefined) {
    return (
      <Stack spacing={1} sx={{ mt: 2 }}>
        <Skeleton height={32} variant="rounded" />
        <Skeleton height={32} variant="rounded" />
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.emailEnabled}
              disabled={savingChannel !== null}
              onChange={(event) => void handleToggle("email", event.target.checked)}
            />
          }
          label={
            <Box sx={{ alignItems: "center", display: "flex", gap: 1 }}>
              <span>AIレビューのメール通知</span>
              {savingChannel === "email" ? <CircularProgress size={16} /> : null}
            </Box>
          }
        />
        {settings.emailGloballyEnabled === false ? (
          <Alert severity="info" sx={{ mt: 1 }} variant="outlined">
            AIレビューのメール通知は全体設定で停止されています。個人設定はそのまま保存されます。
          </Alert>
        ) : null}
        {feedback?.channel === "email" ? (
          <Alert severity={feedback.severity} sx={{ mt: 1 }} variant="outlined">
            {feedback.message}
          </Alert>
        ) : null}
      </Box>
      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.lineEnabled}
              disabled={savingChannel !== null || (!settings.lineLinked && !settings.lineEnabled)}
              onChange={(event) => void handleToggle("line", event.target.checked)}
            />
          }
          label={
            <Box sx={{ alignItems: "center", display: "flex", gap: 1 }}>
              <span>AIレビューのLINE通知</span>
              {savingChannel === "line" ? <CircularProgress size={16} /> : null}
            </Box>
          }
        />
        {!settings.lineLinked ? (
          <Typography color="text.secondary" sx={{ ml: 5.5 }} variant="caption">
            LINEアカウントを連携するとONにできます。連携しても自動ではONになりません。
            通知は連携が有効な間だけ届きます。
          </Typography>
        ) : null}
        {settings.lineGloballyEnabled === false ? (
          <Alert severity="info" sx={{ mt: 1 }} variant="outlined">
            AIレビューのLINE通知は全体設定で停止されています。個人設定はそのまま保存されます。
          </Alert>
        ) : null}
        {feedback?.channel === "line" ? (
          <Alert severity={feedback.severity} sx={{ mt: 1 }} variant="outlined">
            {feedback.message}
          </Alert>
        ) : null}
      </Box>
      <Box>
        <Typography component="h3" variant="subtitle2">
          個別に停止できないメール
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="caption">
          以下のメールはアカウントやグループの管理上必須のため、個別に停止できません。
        </Typography>
        <Box component="ul" sx={{ color: "text.secondary", m: 0, mt: 0.5, pl: 2.5 }}>
          {mandatoryEmailNotifications.map((entry) => (
            <li key={entry.type}>
              <Typography color="text.secondary" variant="caption">
                {entry.label}
              </Typography>
            </li>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
