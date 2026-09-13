/**
 * グループ削除の purge 対象ストア（domain interface）。
 * ステージ名（＝テーブル名）をキーに対象テーブルの走査・削除を抽象化する。
 * テーブル/インデックスの対応付けは infrastructure 層（lib/convex）が担う。
 */
import type { PurgeStage } from "./stages";

/** purge 対象ドキュメントの読み出し結果。ステージ固有フィールドのみ optional で保持する。 */
export type PurgeDocument = {
  id: string;
  /** sourceDocuments ステージでのみ使用（storage ファイル削除判定）。 */
  imageStorageId?: string;
  /** groupMembers ステージでのみ使用（ユーザーの activeGroupId 解除判定）。 */
  userId?: string;
};

/** 読み取り専用コンテキスト（query）でも使える走査ポート。 */
export interface GroupDeletionPurgeReadStore {
  /** ステージの対象ドキュメントを先頭から limit 件取得する。 */
  takeStageDocuments(stage: PurgeStage, groupId: string, limit: number): Promise<PurgeDocument[]>;
  /** ステージの対象ドキュメントを全件取得する。 */
  listAllStageDocuments(stage: PurgeStage, groupId: string): Promise<PurgeDocument[]>;
  /** ステージに対象ドキュメントが残っているか。 */
  hasStageDocuments(stage: PurgeStage, groupId: string): Promise<boolean>;
}

export interface GroupDeletionPurgeStore extends GroupDeletionPurgeReadStore {
  /** ドキュメントを物理削除する。 */
  deleteDocument(id: string): Promise<void>;
  /** グループ本体ドキュメントを物理削除する。 */
  deleteGroup(groupId: string): Promise<void>;
  /** storage ファイルのメタデータが存在するか。 */
  storageMetadataExists(storageId: string): Promise<boolean>;
  /** storage ファイルを削除する。 */
  deleteStorageFile(storageId: string): Promise<void>;
}
