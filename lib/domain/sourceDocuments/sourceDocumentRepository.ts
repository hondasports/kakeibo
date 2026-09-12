/**
 * sourceDocuments リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { SourceDocumentFields } from "./sourceDocument";

export interface SourceDocumentRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: SourceDocumentFields): Promise<string>;
}
