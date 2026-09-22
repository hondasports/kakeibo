import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { getWeekEndDay } from "../../week";

const DAY_OPTIONS = [
  { value: 0, label: "日曜日" },
  { value: 1, label: "月曜日" },
  { value: 2, label: "火曜日" },
  { value: 3, label: "水曜日" },
  { value: 4, label: "木曜日" },
  { value: 5, label: "金曜日" },
  { value: 6, label: "土曜日" },
];

export function WeekDaySettingsPanel() {
  const userProfile = useQuery(api.users.queries.getUserProfile);
  const updateWeeklyDays = useMutation(api.users.mutations.updateWeeklyDays);
  const [startDay, setStartDay] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const [prevUserProfile, setPrevUserProfile] = useState<typeof userProfile>(undefined);
  if (prevUserProfile !== userProfile) {
    setPrevUserProfile(userProfile);
    if (userProfile) {
      setStartDay(userProfile.weeklyStartDay ?? 1);
    }
  }

  if (userProfile === undefined) {
    return (
      <Stack aria-label="週の設定を読み込んでいます" spacing={2}>
        <Skeleton height={30} width="30%" />
        <Skeleton height={56} variant="rounded" />
      </Stack>
    );
  }

  const startLabel = DAY_OPTIONS.find((day) => day.value === startDay)?.label ?? "月曜日";
  const endDay = getWeekEndDay(startDay);
  const endLabel = DAY_OPTIONS.find((day) => day.value === endDay)?.label ?? "日曜日";

  const handleStartDayChange = (event: SelectChangeEvent<number>) => {
    setStartDay(Number(event.target.value));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateWeeklyDays({ weeklyStartDay: startDay, weeklyEndDay: endDay });
      setFeedback({ message: "週の設定を保存しました", severity: "success" });
    } catch {
      setFeedback({ message: "週の設定を保存できませんでした", severity: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h5">
          週の設定
        </Typography>
        <Typography color="text.secondary" variant="body2">
          週の始まりから7日間を集計します。週の終わりは自動で決まります。
        </Typography>
      </Box>

      <Box className="settings-row settings-week-row">
        <Typography sx={{ fontWeight: 700 }} variant="body2">
          週の期間
        </Typography>
        <Typography aria-live="polite">
          {startLabel} から {endLabel} まで
        </Typography>
        <Stack
          className="settings-week-controls"
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
        >
          <FormControl fullWidth size="small">
            <InputLabel id="week-start-day-label">週の始まり</InputLabel>
            <Select
              disabled={isSaving}
              id="week-start-day"
              label="週の始まり"
              labelId="week-start-day-label"
              onChange={handleStartDayChange}
              value={startDay}
            >
              {DAY_OPTIONS.map((day) => (
                <MenuItem key={day.value} value={day.value}>
                  {day.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box
            aria-label="週の終わり"
            aria-live="polite"
            sx={{
              alignItems: "center",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              display: "flex",
              minHeight: 40,
              px: 1.5,
            }}
            role="status"
          >
            <Typography color="text.secondary" variant="body2">
              週の終わり: {endLabel}
            </Typography>
          </Box>
          <Button
            disabled={isSaving}
            onClick={handleSave}
            startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
            variant="contained"
          >
            {isSaving ? "保存中…" : "変更を保存"}
          </Button>
        </Stack>
      </Box>

      <Snackbar
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        autoHideDuration={3000}
        onClose={() => setFeedback(null)}
        open={feedback !== null}
      >
        <Alert
          onClose={() => setFeedback(null)}
          severity={feedback?.severity ?? "success"}
          variant="filled"
        >
          {feedback?.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
