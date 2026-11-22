import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Alert,
  Button,
  CircularProgress,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { formatYen } from "../../../../lib/domain/common/currency";
import { validateMonthlyBudgetYen } from "../../../../lib/domain/groups/monthlyBudget";

/** 月予算の設定（グループオーナーのみ変更可・全メンバーに進捗表示される）。 */
export function MonthlyBudgetSettingsPanel() {
  const myGroup = useQuery(api.groups.queries.getMyGroup);
  const setMonthlyBudget = useMutation(api.groups.mutations.setMonthlyBudget);
  const [input, setInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const [prevMyGroup, setPrevMyGroup] = useState<typeof myGroup>(undefined);
  if (prevMyGroup !== myGroup) {
    setPrevMyGroup(myGroup);
    setInput(myGroup?.monthlyBudgetYen != null ? String(myGroup.monthlyBudgetYen) : "");
  }

  const parsed = input.trim() === "" ? null : Number(input);
  const inputError = !validateMonthlyBudgetYen(parsed).success;
  const dirty = parsed !== (myGroup?.monthlyBudgetYen ?? null);
  const isOwner = myGroup?.role === "owner";

  const save = async (amountYen: number | null) => {
    setIsSaving(true);
    try {
      await setMonthlyBudget({ monthlyBudgetYen: amountYen });
      setFeedback({
        message: amountYen === null ? "月予算を解除しました" : "月予算を保存しました",
        severity: "success",
      });
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : "月予算の保存に失敗しました",
        severity: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Typography component="h2" variant="h5">
        月予算
      </Typography>
      <Typography color="text.secondary" variant="body2">
        月ごとの支出の上限。月次サマリーとダッシュボードで消化率と残額を確認できます。
      </Typography>
      {myGroup === undefined ? (
        <Skeleton height={40} variant="rounded" />
      ) : (
        <>
          {!isOwner && (
            <Alert severity="info" variant="outlined">
              月予算の変更はグループのオーナーのみ行えます。現在の予算:{" "}
              {myGroup?.monthlyBudgetYen != null ? formatYen(myGroup.monthlyBudgetYen) : "未設定"}
            </Alert>
          )}
          {isOwner && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                error={inputError}
                fullWidth
                helperText={
                  inputError
                    ? "0〜999,999,999円の整数で入力してください"
                    : "空欄で保存すると解除します"
                }
                slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
                label="月予算（円）"
                onChange={(event) => setInput(event.target.value)}
                size="small"
                value={input}
              />
              <Button
                disabled={inputError || !dirty || isSaving}
                onClick={() => void save(parsed)}
                sx={{ minHeight: 44, minWidth: 96 }}
                variant="contained"
              >
                {isSaving ? <CircularProgress size={20} /> : "保存"}
              </Button>
            </Stack>
          )}
        </>
      )}
      <Snackbar autoHideDuration={4000} onClose={() => setFeedback(null)} open={feedback !== null}>
        <Alert onClose={() => setFeedback(null)} severity={feedback?.severity} variant="filled">
          {feedback?.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
