/**
 * groupDeletionJobs のドメイン型と読み取りポート（domain interface）。
 * Convex の generated 型には依存せず、ID は string として扱う。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
export type GroupDeletionJobSource = "owner" | "account_deletion" | "e2e_cleanup";

export type GroupDeletionJobStatus =
  | "requested"
  | "running"
  | "retry_wait"
  | "failed"
  | "completed";

export type GroupDeletionJobStage =
  | "recipientSnapshot"
  | "startedEnqueue"
  | "receiptAnalysisImageJobs"
  | "aiExpenseDraftItems"
  | "aiExpenseDrafts"
  | "receiptAnalysisBatches"
  | "expenseEntries"
  | "receipts"
  | "sourceDocuments"
  | "weekSessions"
  | "categories"
  | "groupInvitations"
  | "managementAuditLogs"
  | "groupMembers"
  | "finalSweep"
  | "completedEnqueue"
  | "recipientCleanup";

export type GroupDeletionJobCounts = {
  receiptAnalysisImageJobs: number;
  aiExpenseDraftItems: number;
  aiExpenseDrafts: number;
  receiptAnalysisBatches: number;
  expenseEntries: number;
  receipts: number;
  sourceDocuments: number;
  storageFiles: number;
  weekSessions: number;
  categories: number;
  groupInvitations: number;
  managementAuditLogs: number;
  groupMembers: number;
  groups: number;
};

/** groupDeletionJobs ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type GroupDeletionJobFields = {
  id?: string;
  targetGroupIdSnapshot: string;
  targetGroupNameSnapshot: string;
  source: GroupDeletionJobSource;
  actorUserIdSnapshot?: string;
  status: GroupDeletionJobStatus;
  stage: GroupDeletionJobStage;
  isActive: boolean;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: number;
  lastErrorCategory?: string;
  snapshotCursor?: string;
  failureNotificationHandledAt?: number;
  deletedCounts: GroupDeletionJobCounts;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export interface GroupDeletionJobReader {
  /** ID で削除ジョブを1件取得する。 */
  get(jobId: string): Promise<GroupDeletionJobFields | null>;
}
