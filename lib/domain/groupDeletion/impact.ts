/**
 * 削除影響プレビュー集計の純粋ドメイン関数。
 * 実際のクエリはポート経由。ここでは取得済み件数から preview count を組み立てる。
 */
import type { GroupDeletionPreviewCount } from "./groupDeletionWorkflow";

/** プレビュー集計の打ち切り上限。 */
export const DELETION_PREVIEW_LIMIT = 100;

export type BoundedPreview<Document> = {
  /** 上限内のドキュメント（派生集計に利用）。 */
  documents: Document[];
  result: GroupDeletionPreviewCount;
};

/**
 * limit+1 件取得した結果から preview count を組み立てる。
 * limit 超過なら at_least で打ち切り、そうでなければ exact。
 */
export function boundedPreview<Document>(
  documents: Document[],
  limit: number = DELETION_PREVIEW_LIMIT,
): BoundedPreview<Document> {
  return {
    documents: documents.slice(0, limit),
    result:
      documents.length > limit
        ? { count: limit, accuracy: "at_least" }
        : { count: documents.length, accuracy: "exact" },
  };
}

/**
 * sourceDocuments の bounded 結果からレシート画像件数を導出する。
 * exact でない場合は集計不能として unknown を返す。
 */
export function deriveReceiptImageCount(
  sourceDocuments: BoundedPreview<{ imageStorageId?: string }>,
): GroupDeletionPreviewCount {
  if (sourceDocuments.result.accuracy !== "exact") {
    return { count: 0, accuracy: "unknown" };
  }
  return {
    count: sourceDocuments.documents.filter((document) => document.imageStorageId !== undefined)
      .length,
    accuracy: "exact",
  };
}
