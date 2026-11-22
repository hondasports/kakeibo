import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

const MAX_MONTHLY_INCOME_YEN = 999_999_999;

function formatIncome(value: number): string {
  return value.toLocaleString("ja-JP");
}

export function MonthlyIncomeSettingsPanel() {
  const userProfile = useQuery(api.users.queries.getUserProfile);
  const updateMonthlyIncome = useMutation(api.users.mutations.updateMonthlyIncome);
  const [incomeText, setIncomeText] = useState("");
  const [savedIncome, setSavedIncome] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const [prevUserProfile, setPrevUserProfile] = useState<typeof userProfile>(undefined);
  if (prevUserProfile !== userProfile) {
    setPrevUserProfile(userProfile);
    if (userProfile) {
      setSavedIncome(userProfile.monthlyIncome);
      setIncomeText(userProfile.monthlyIncome === null ? "" : String(userProfile.monthlyIncome));
    }
  }

  if (userProfile === undefined) {
    return (
      <Stack aria-label="月収入の設定を読み込んでいます" spacing={2}>
        <Skeleton height={30} width="30%" />
        <Skeleton height={56} variant="rounded" />
      </Stack>
    );
  }

  const trimmed = incomeText.trim();
  const parsed = trimmed === "" ? undefined : Number(trimmed);
  const inputError =
    trimmed !== "" &&
    (parsed === undefined ||
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > MAX_MONTHLY_INCOME_YEN);

  const isDirty = (parsed ?? null) !== savedIncome;

  const handleSave = async () => {
    if (inputError) return;
    setIsSaving(true);
    try {
      await updateMonthlyIncome(parsed === undefined ? {} : { monthlyIncome: parsed });
      setSavedIncome(parsed ?? null);
      setFeedback({
        message:
          parsed === undefined
            ? "月収入の設定を解除しました"
            : `月収入を${formatIncome(parsed)}円に設定しました`,
        severity: "success",
      });
    } catch {
      setFeedback({ message: "月収入を保存できませんでした", severity: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h5">
          月収入
        </Typography>
        <Typography color="text.secondary" variant="body2">
          給与などの固定収入を登録します。個人設定であり、共有グループの収支集計には含まれません。
        </Typography>
      </Box>

      <Box className="settings-row">
        <Typography sx={{ fontWeight: 700 }} variant="body2">
          月収入
        </Typography>
        <Typography aria-live="polite">
          {savedIncome === null ? "未設定" : `${formatIncome(savedIncome)}円`}
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
          <TextField
            disabled={isSaving}
            error={inputError}
            fullWidth
            helperText={
              inputError
                ? "0以上999,999,999以下の整数（円）で入力してください"
                : "空欄にすると未設定に戻ります"
            }
            id="monthly-income"
            label="月収入"
            onChange={(event) => setIncomeText(event.target.value)}
            slotProps={{
              input: {
                endAdornment: <InputAdornment position="end">円</InputAdornment>,
                inputProps: { inputMode: "numeric", min: 0 },
              },
            }}
            type="number"
            value={incomeText}
          />
          <Button
            disabled={isSaving || !isDirty || inputError}
            onClick={handleSave}
            startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
            variant="contained"
          >
            {isSaving ? "保存中…" : "変更を保存"}
          </Button>
        </Stack>
        {isDirty && !isSaving ? (
          <Typography aria-live="polite" color="warning.dark" variant="caption">
            未保存の変更があります
          </Typography>
        ) : null}
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
