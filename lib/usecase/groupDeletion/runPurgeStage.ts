/**
 * purge ステージの1バッチ実行（内部ステップ）。
 * 対象テーブルを BATCH_SIZE 件削除し、storage ファイル・ユーザー activeGroupId の副作用を伴う。
 * 既存 groupDeletionStagePurge.deleteStageBatch の移植（progress は戻り値で返す）。
 */
import { BATCH_SIZE } from "../../domain/groupDeletion/constants";
import type { PurgeStage } from "../../domain/groupDeletion/stages";
import type { GroupDeletionMutationDeps } from "./deps";

export type StageProgress = { deleted: number; storageFiles: number };

export async function runPurgeStage(
  deps: Pick<GroupDeletionMutationDeps, "purge" | "users">,
  stage: PurgeStage,
  groupId: string,
  progress: StageProgress,
): Promise<void> {
  const docs = await deps.purge.takeStageDocuments(stage, groupId, BATCH_SIZE);
  for (const doc of docs) {
    if (stage === "sourceDocuments" && doc.imageStorageId !== undefined) {
      if (await deps.purge.storageMetadataExists(doc.imageStorageId)) {
        await deps.purge.deleteStorageFile(doc.imageStorageId);
        progress.storageFiles += 1;
      }
    } else if (stage === "groupMembers" && doc.userId !== undefined) {
      const user = await deps.users.findByUserId(doc.userId);
      if (user !== null && user.activeGroupId === groupId) {
        await deps.users.setActiveGroup(user.docId, undefined, Date.now());
      }
    }
    await deps.purge.deleteDocument(doc.id);
    progress.deleted += 1;
  }
}
