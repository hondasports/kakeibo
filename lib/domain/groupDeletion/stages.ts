/**
 * グループ削除のステージ定義と遷移ルール（純粋ドメイン関数）。
 * Convex の generated 型には依存しない。
 */
import type {
  GroupDeletionJobSource,
  GroupDeletionJobStage,
  GroupDeletionJobStatus,
} from "./groupDeletionJob";

/**
 * グループ物理削除の依存順（purge 対象ステージ＝テーブル名）。
 * groupId を持つ table を追加した場合、schema 同期 test が未分類を検出する。
 */
export const GROUP_DELETION_PURGE_STAGES = [
  "receiptAnalysisImageJobs",
  "aiExpenseDraftItems",
  "aiExpenseDrafts",
  "receiptAnalysisBatches",
  "expenseEntries",
  "receipts",
  "sourceDocuments",
  "weekSessions",
  "categories",
  "groupInvitations",
  "managementAuditLogs",
  "groupMembers",
] as const;

/** purge 対象ステージ（テーブル名と一致する）。 */
export type PurgeStage = (typeof GROUP_DELETION_PURGE_STAGES)[number];

/** nextDeletionStage が辿るステージ列（recipientSnapshot/startedEnqueue は別系統）。 */
const DELETION_STAGE_ORDER: ReadonlyArray<GroupDeletionJobStage> = [
  ...GROUP_DELETION_PURGE_STAGES,
  "finalSweep",
  "completedEnqueue",
  "recipientCleanup",
];

/** 次のステージを返す。末尾では末尾を維持する。 */
export function nextDeletionStage(stage: GroupDeletionJobStage): GroupDeletionJobStage {
  const currentIndex = DELETION_STAGE_ORDER.indexOf(stage);
  return DELETION_STAGE_ORDER[Math.min(currentIndex + 1, DELETION_STAGE_ORDER.length - 1)];
}

/** バッチ処理が purge テーブル走査を行うステージか。 */
export function isPurgeStage(stage: GroupDeletionJobStage): stage is PurgeStage {
  return (GROUP_DELETION_PURGE_STAGES as ReadonlyArray<string>).includes(stage);
}

/** グループ本体削除後にも実行可能なステージか（resume 判定で使用）。 */
export function canRunAfterGroupDeletion(stage: GroupDeletionJobStage): boolean {
  return stage === "finalSweep" || stage === "completedEnqueue" || stage === "recipientCleanup";
}

/** 受信者通知フローを使うジョブか（owner 起点かつ通知対象ユーザーがいる場合）。 */
export function usesRecipientNotifications(
  source: GroupDeletionJobSource,
  actorUserIdSnapshot: string | undefined,
): boolean {
  return source === "owner" && actorUserIdSnapshot !== undefined;
}

/** ジョブ作成時の初期ステージを決める。 */
export function initialStageForJob(
  source: GroupDeletionJobSource,
  actorUserIdSnapshot: string | undefined,
): GroupDeletionJobStage {
  return usesRecipientNotifications(source, actorUserIdSnapshot)
    ? "recipientSnapshot"
    : GROUP_DELETION_PURGE_STAGES[0];
}

/** これ以上バッチ処理を進めない終端ステータスか。 */
export function isTerminalJobStatus(status: GroupDeletionJobStatus): boolean {
  return status === "completed" || status === "failed";
}
