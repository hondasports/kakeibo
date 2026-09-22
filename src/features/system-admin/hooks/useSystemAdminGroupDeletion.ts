import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { AppEnvironment } from "../types";

type StatusFilter = "" | "running" | "retry_wait" | "failed" | "completed";

const statusLabels: Record<StatusFilter, string> = {
  "": "すべて",
  running: "running",
  retry_wait: "retry_wait",
  failed: "failed",
  completed: "completed",
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
    if (!selected || reason.trim().length < 1 || reason.trim().length > 500) return;
    setSaving(true);
    setError("");
    try {
      await resume({ jobId: selected.jobId, reason: reason.trim() });
      closeDialog();
      setSuccess("削除ジョブの再開を受け付けました。監査ログに記録しました。");
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
