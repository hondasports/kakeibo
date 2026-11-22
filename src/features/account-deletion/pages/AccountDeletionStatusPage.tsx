import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { SuzumemoLoadingState } from "../../ui";
import { AccountDeletionErrorBoundary } from "../components/AccountDeletionErrorBoundary";

export function AccountDeletionStatusPage() {
  return (
    <AccountDeletionErrorBoundary>
      <AccountDeletionStatusPageContent />
    </AccountDeletionErrorBoundary>
  );
}

function BackToSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} sx={{ alignSelf: "flex-start" }} variant="outlined">
      設定に戻る
    </Button>
  );
}

function AccountDeletionStatusPageContent() {
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth();
  const status = useQuery(
    api.accountDeletion.getMyAccountDeletionStatus,
    isAuthenticated ? {} : "skip",
  );
  const retry = useMutation(api.accountDeletion.retryAccountDeletion);
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const backToSettings = () => navigate("/settings");

  if (isConvexAuthLoading)
    return (
      <SuzumemoLoadingState
        label="ログイン状態を確認中"
        message="ログイン状態を確認しています。"
        variant="page"
      />
    );
  if (!isAuthenticated)
    return (
      <Box className="app-main">
        <Paper className="settings-ledger" elevation={0}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">
              ログインが必要です
            </Typography>
            <Typography color="text.secondary">
              退会状況を確認するには、削除を開始したアカウントでログインし直してください。
            </Typography>
            <Button
              onClick={() => navigate("/")}
              sx={{ alignSelf: "flex-start" }}
              variant="outlined"
            >
              ホームへ戻る
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  if (status === undefined)
    return (
      <SuzumemoLoadingState
        label="退会状況を読み込み中"
        message="退会処理の状況を確認しています。"
        variant="page"
      />
    );
  if (status === null)
    return (
      <Box className="app-main">
        <Paper className="settings-ledger" elevation={0}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">
              アカウント削除の要求が見つかりません
            </Typography>
            <Typography color="text.secondary">
              進行中のアカウント削除処理がありません。設定画面からアカウント削除を開始できます。
            </Typography>
            <BackToSettingsButton onClick={backToSettings} />
          </Stack>
        </Paper>
      </Box>
    );
  const failed = status.status === "failed";
  const isRetryWait = status.status === "retry_wait" || status.status === "finalization_retry_wait";
  const isIdentityDeleted = status.status === "identity_deleted";
  const statusLabel =
    status.status === "preparing_groups"
      ? "グループの削除準備をしています"
      : status.status === "purging_groups"
        ? "グループデータを削除しています"
        : isRetryWait
          ? "再試行を待っています"
          : isIdentityDeleted
            ? "ログイン情報の削除が完了しました"
            : "アカウントを削除しています";
  return (
    <Box className="app-main">
      <Paper className="settings-ledger" elevation={0}>
        <Stack spacing={2.5}>
          <Typography component="h1" variant="h5">
            {failed ? "アカウントを削除できませんでした" : statusLabel}
          </Typography>
          {failed ? (
            <>
              <Alert severity="error">
                退会処理を完了できませんでした。もう一度試すことができます。
              </Alert>
              {retryError ? <Alert severity="error">{retryError}</Alert> : null}
              <Button
                color="error"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  setRetryError("");
                  try {
                    await retry({});
                  } catch {
                    setRetryError(
                      "再試行を開始できませんでした。しばらくしてからもう一度お試しください。",
                    );
                  } finally {
                    setRetrying(false);
                  }
                }}
                sx={{ alignSelf: "flex-start" }}
                variant="contained"
              >
                {retrying ? <CircularProgress color="inherit" size={20} /> : "もう一度試す"}
              </Button>
            </>
          ) : (
            <>
              <Typography color="text.secondary">
                {isRetryWait
                  ? "一時的な問題があったため、再試行を待っています。"
                  : "退会手続きを進めています。処理が完了すると、登録されているメールアドレスへお知らせします。"}
              </Typography>
              <Typography color="text.secondary">
                このページを閉じても処理は続きます。この処理は取り消せません。
              </Typography>
              {isIdentityDeleted ? (
                <Typography color="text.secondary">
                  ログイン情報は削除済みです。残りのデータ削除が完了すると、登録されているメールアドレスへお知らせします。
                </Typography>
              ) : null}
            </>
          )}
          <BackToSettingsButton onClick={backToSettings} />
        </Stack>
      </Paper>
    </Box>
  );
}
