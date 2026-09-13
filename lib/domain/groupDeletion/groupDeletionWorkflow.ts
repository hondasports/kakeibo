/**
 * グループ削除ワークフローのサービス・ポート（domain interface）。
 * 削除ジョブの開始・再開・影響件数の集計など、複数テーブルにまたがる
 * オーケストレーションの抽象。実装は infrastructure 層（lib/convex）が提供する。
 */
import type { GroupDeletionJobSource } from "./groupDeletionJob";

/** 削除プレビューの件数。exact=正確、at_least=上限打ち切り、unknown=集計不能。 */
export type GroupDeletionPreviewCount = {
  count: number;
  accuracy: "exact" | "at_least" | "unknown";
};

export type GroupDeletionImpactCounts = {
  members: GroupDeletionPreviewCount;
  invitations: GroupDeletionPreviewCount;
  sourceDocuments: GroupDeletionPreviewCount;
  receiptImages: GroupDeletionPreviewCount;
  expenseEntries: GroupDeletionPreviewCount;
  receipts: GroupDeletionPreviewCount;
  categories: GroupDeletionPreviewCount;
  aiDrafts: GroupDeletionPreviewCount;
  aiDraftItems: GroupDeletionPreviewCount;
  analysisBatches: GroupDeletionPreviewCount;
  analysisJobs: GroupDeletionPreviewCount;
  weekSessions: GroupDeletionPreviewCount;
  managementAuditLogs: GroupDeletionPreviewCount;
};

export interface GroupDeletionWorkflowService {
  /** 削除ジョブを開始し、採番されたジョブ ID を返す。 */
  start(args: {
    groupId: string;
    source: GroupDeletionJobSource;
    actorUserIdSnapshot?: string;
  }): Promise<string>;
  /** 停止中の削除ジョブを再開する。 */
  resume(args: { jobId: string }): Promise<null>;
  /** 削除対象の関連データ件数を集計する。 */
  countImpact(groupId: string): Promise<GroupDeletionImpactCounts>;
}
