import { api } from "../../../../convex/_generated/api";
import { Component, type ReactNode, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import type { Id } from "../../../../convex/_generated/dataModel";

class StatusErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box className="app-main">
        <Paper className="settings-ledger" elevation={0}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">
              グループ削除状況を読み込めませんでした
            </Typography>
            <Alert severity="error">通信状態を確認して、もう一度お試しください。</Alert>
            <Button onClick={() => window.location.reload()} variant="outlined">
              再読み込み
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }
}

function GroupDeletionStatusContent() {
  const { jobId: jobIdParam } = useParams();
  const jobId = jobIdParam as Id<"groupDeletionJobs"> | undefined;
  const status = useQuery(api.groups.deletion.getGroupDeletionStatus, jobId ? { jobId } : "skip");
  const groups = useQuery(
    api.groups.queries.listMyGroups,
    status?.status === "completed" ? {} : "skip",
  );
  const resume = useMutation(api.groups.deletion.resumeGroupDeletion);
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  if (!jobId || status === null) {
    return (
      <Box className="app-main">
        <Paper className="settings-ledger" elevation={0}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">
              グループ削除の要求が見つかりません
            </Typography>
            <Typography color="text.secondary">
              この削除状況を表示できません。URLまたはログイン中のアカウントをご確認ください。
            </Typography>
          </Stack>
        </Paper>
      </Box>
    );
  }
  if (status === undefined) {
    return (
      <Box className="app-main" role="status">
        <CircularProgress aria-label="グループ削除状況を読み込み中" />
      </Box>
    );
  }

  const failed = status.status === "failed";
  const completed = status.status === "completed";
  const heading = failed
    ? "グループの削除を完了できませんでした"
    : completed
      ? "グループの完全削除が完了しました"
      : status.status === "retry_wait"
        ? "グループの削除を自動再試行しています"
        : status.status === "requested"
          ? "グループの削除処理を開始しました"
          : "グループを削除しています";

  return (
    <Box className="app-main">
      <Paper className="settings-ledger" elevation={0}>
        <Stack aria-live="polite" spacing={2.5}>
          <Typography component="h1" variant="h5">
            {heading}
          </Typography>
          <Typography color="text.secondary">対象: {status.groupName}</Typography>
          {failed ? (
            <>
              <Alert severity="error">
                削除を完了できませんでした。グループは利用できない状態のままです。
              </Alert>
              {retryError ? <Alert severity="error">{retryError}</Alert> : null}
              <Button
                color="error"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  setRetryError("");
                  try {
                    await resume({ jobId: status.jobId });
                  } catch {
                    setRetryError("再開できませんでした。しばらくしてからもう一度お試しください。");
                  } finally {
                    setRetrying(false);
                  }
                }}
                variant="contained"
              >
                {retrying ? <CircularProgress color="inherit" size={20} /> : "削除を再開する"}
              </Button>
            </>
          ) : completed ? (
            <Button
              disabled={groups === undefined}
              onClick={() => navigate((groups?.length ?? 0) > 0 ? "/group/select" : "/group/setup")}
              variant="contained"
            >
              続ける
            </Button>
          ) : (
            <>
              <Typography color="text.secondary">
                完全削除はバックグラウンドで進みます。この画面を閉じても処理は継続します。
              </Typography>
              <Typography color="text.secondary">この処理は取り消し・復元できません。</Typography>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

export function GroupDeletionStatusPage() {
  return (
    <StatusErrorBoundary>
      <GroupDeletionStatusContent />
    </StatusErrorBoundary>
  );
}
