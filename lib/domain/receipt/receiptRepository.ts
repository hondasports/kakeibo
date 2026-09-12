/**
 * receipts リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { ReceiptFields, ReceiptUpdatePatch } from "./receipt";

export interface ReceiptRepository {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<ReceiptFields | null>;
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: Omit<ReceiptFields, "id">): Promise<string>;
  /** 部分更新する。 */
  patch(id: string, patch: ReceiptUpdatePatch & { updatedAt: number }): Promise<void>;
  /** 削除する。 */
  delete(id: string): Promise<void>;
}
