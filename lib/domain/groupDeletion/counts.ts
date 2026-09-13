/**
 * グループ削除の削除件数カウンタ（純粋ドメイン関数）。
 */
import type { GroupDeletionJobCounts } from "./groupDeletionJob";
import type { PurgeStage } from "./stages";

/** 全カウンタ 0 の削除件数を返す。 */
export function zeroDeletedCounts(): GroupDeletionJobCounts {
  return {
    receiptAnalysisImageJobs: 0,
    aiExpenseDraftItems: 0,
    aiExpenseDrafts: 0,
    receiptAnalysisBatches: 0,
    expenseEntries: 0,
    receipts: 0,
    sourceDocuments: 0,
    storageFiles: 0,
    weekSessions: 0,
    categories: 0,
    groupInvitations: 0,
    managementAuditLogs: 0,
    groupMembers: 0,
    groups: 0,
  };
}

/** purge ステージの進捗（削除数・storageファイル数）を既存カウントへ累積した新オブジェクトを返す。 */
export function accumulateDeletedCounts(
  counts: GroupDeletionJobCounts,
  stage: PurgeStage,
  progress: { deleted: number; storageFiles: number },
): GroupDeletionJobCounts {
  return {
    ...counts,
    [stage]: counts[stage] + progress.deleted,
    storageFiles: counts.storageFiles + progress.storageFiles,
  };
}

/** グループ本体削除をカウントへ反映した新オブジェクトを返す。 */
export function incrementGroupDeletedCount(counts: GroupDeletionJobCounts): GroupDeletionJobCounts {
  return { ...counts, groups: counts.groups + 1 };
}
