import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { GroupDeletionJobStatus } from "../../../../lib/domain/groupDeletion/groupDeletionJob";
import { normalizeSystemAdminReason } from "../../../../lib/domain/systemAdmin/reason";
import type { AppEnvironment } from "../types";

type StatusFilter = GroupDeletionJobStatus | "";

const statusLabels: Record<StatusFilter, string> = {
  "": "すべて",
  requested: "受付済み",
  running: "実行中",
  retry_wait: "再試行待ち",
  failed: "失敗",
  completed: "完了",
};

export function useSystemAdminGroupDeletion() {
  const [status, setStatus] = useState<StatusFilter>("failed");
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const list = useQuery(api.systemAdminGroupDeletion.listGroupDeletionJobs, {
    paginationOpts: { numItems: 20, cursor },
    status: status || undefined,
  });
  const resume = useMutation(api.systemAdminGroupDeletion.resumeGroupDeletion);

  const selected = list?.page.find((job) => job.jobId === selectedJobId);
  const environment = (list?.environment ?? "development") as AppEnvironment;

  const closeDialog = () => {
    setSelectedJobId(null);
    setReason("");
    setError("");
  };

  const submit = async () => {
    const reasonResult = normalizeSystemAdminReason(reason);
    if (!selected || !reasonResult.success) return;
    setSaving(true);
    setError("");
    try {
      await resume({ jobId: selected.jobId, reason: reasonResult.reason });
      closeDialog();
      setSuccess(
        `「${selected.targetGroupNameSnapshot}」の削除ジョブの再開を受け付けました（監査ログに記録済み）`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "再開に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (nextStatus: StatusFilter) => {
    setStatus(nextStatus);
    setCursor(null);
  };

  return {
    status,
    statusLabels,
    handleStatusChange,
    cursor,
    setCursor,
    list,
    selectedJobId,
    setSelectedJobId,
    selected,
    environment,
    reason,
    setReason,
    saving,
    error,
    success,
    setSuccess,
    submit,
    closeDialog,
  };
}
