import { Button, Chip, Stack, Typography } from "@mui/material";
import { deletionJobStatusLabels, displayLabel } from "../lib/displayLabels";
import { SystemAdminEmptyState } from "../pages/SystemAdminPageFrame";
import type { useSystemAdminGroupDeletion } from "../hooks/useSystemAdminGroupDeletion";

type GroupDeletionJobListProps = {
  list: NonNullable<ReturnType<typeof useSystemAdminGroupDeletion>["list"]>;
  onSelectJob: (jobId: string) => void;
  onLoadMore: () => void;
};

export function GroupDeletionJobList({ list, onSelectJob, onLoadMore }: GroupDeletionJobListProps) {
  if (list.page.length === 0) {
    return <SystemAdminEmptyState message="該当する削除ジョブはありません。" />;
  }

  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      {list.page.map((job) => (
        <Stack
          key={job.jobId}
          spacing={1}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ justifyContent: "space-between" }}
          >
            <Stack>
              <Typography component="h2" variant="h6">
                {job.targetGroupNameSnapshot}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                groupId: {job.targetGroupIdSnapshot}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                実行元: {job.source} / 段階: {job.stage}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                試行: {job.attemptCount}/{job.maxAttempts} / 更新:{" "}
                {new Intl.DateTimeFormat("ja-JP").format(job.updatedAt)}
              </Typography>
              {job.lastErrorCategory ? (
                <Typography color="error" variant="body2">
                  エラー種別: {job.lastErrorCategory}
                </Typography>
              ) : null}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Chip
                color={
                  job.status === "failed"
                    ? "error"
                    : job.status === "completed"
                      ? "default"
                      : "warning"
                }
                label={displayLabel(deletionJobStatusLabels, job.status)}
                size="small"
              />
              {job.status === "failed" ? (
                <Button onClick={() => onSelectJob(job.jobId)} variant="outlined">
                  再開
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </Stack>
      ))}
      <Button disabled={list.isDone} onClick={onLoadMore}>
        次のページ
      </Button>
    </Stack>
  );
}
