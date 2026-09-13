import type { PurgeStage } from "../../../lib/domain/groupDeletion/stages";

/**
 * グループ物理削除の依存順。
 * groupId を持つtableを追加した場合、schema同期testが未分類を検出する。
 * 正本は lib/domain/groupDeletion/stages.ts。
 */
export { GROUP_DELETION_PURGE_STAGES as GROUP_DELETION_PURGE_TABLES } from "../../../lib/domain/groupDeletion/stages";

export type GroupDeletionPurgeTable = PurgeStage;
