import { Alert, FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import { SystemAdminPageFrame } from "./SystemAdminPageFrame";
import { GroupDeletionJobList } from "../components/GroupDeletionJobList";
import { GroupDeletionResumeDialog } from "../components/GroupDeletionResumeDialog";
import { useSystemAdminGroupDeletion } from "../hooks/useSystemAdminGroupDeletion";

export function SystemAdminGroupDeletionPage() {
  const {
    status,
    statusLabels,
    handleStatusChange,
    list,
    selected,
    environment,
    reason,
    setReason,
    saving,
    error,
    success,
    setSuccess,
    submit,
    setSelectedJobId,
    setCursor,
    closeDialog,
  } = useSystemAdminGroupDeletion();

  return (
    <SystemAdminPageFrame
      description="削除処理の状態と再試行可能な失敗だけを確認します。家計内容は取得しません。"
      title="グループ削除ジョブ"
    >
      {environment === "production" ? (
        <Alert severity="warning">
          Production環境です。再開理由と対象を確認してから操作してください。
        </Alert>
      ) : null}
      {success ? (
        <Alert aria-live="polite" severity="success" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      ) : null}
      <FormControl sx={{ minWidth: 180 }}>
        <InputLabel id="group-deletion-status-label">状態</InputLabel>
        <Select
          label="状態"
          labelId="group-deletion-status-label"
          value={status}
          onChange={(event) => handleStatusChange(event.target.value as typeof status)}
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {list === undefined ? (
        <Typography role="status">削除ジョブを読み込んでいます…</Typography>
      ) : null}
      {list ? (
        <GroupDeletionJobList
          list={list}
          onLoadMore={() => setCursor(list.continueCursor)}
          onSelectJob={setSelectedJobId}
        />
      ) : null}
      <GroupDeletionResumeDialog
        environment={environment}
        error={error}
        open={selected !== undefined && selected !== null}
        reason={reason}
        saving={saving}
        targetGroupNameSnapshot={selected?.targetGroupNameSnapshot}
        onClose={closeDialog}
        onConfirm={submit}
        onReasonChange={setReason}
      />
    </SystemAdminPageFrame>
  );
}
