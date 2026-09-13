/**
 * E2E クリーンアップ用のグループ紐付きデータ全物理削除（内部ステップ）。
 * 既存 deleteGroupPhysically.deleteAllGroupScopedData の移植 —
 * `users` と Clerk アカウントは削除しない。managementAuditLogs・通知受信者・
 * 削除ジョブ自体も対象外（パイプラインの purge 順とは別の削除対象リスト）。
 * storage ファイルはメタデータ確認なしで削除を試みる（ベース挙動を維持）。
 */
import type { PurgeStage } from "../../domain/groupDeletion/stages";
import type { GroupDeletionMutationDeps } from "./deps";

/** ベース deleteAllGroupScopedData の削除順（managementAuditLogs は含まない）。 */
const E2E_PURGE_STAGES = [
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
  "groupMembers",
] as const satisfies ReadonlyArray<PurgeStage>;

export async function deleteAllGroupScopedData(
  deps: Pick<GroupDeletionMutationDeps, "purge">,
  groupId: string,
): Promise<void> {
  for (const stage of E2E_PURGE_STAGES) {
    const documents = await deps.purge.listAllStageDocuments(stage, groupId);
    for (const document of documents) {
      if (stage === "sourceDocuments" && document.imageStorageId !== undefined) {
        await deps.purge.deleteStorageFile(document.imageStorageId);
      }
      await deps.purge.deleteDocument(document.id);
    }
  }
  await deps.purge.deleteGroup(groupId);
}
