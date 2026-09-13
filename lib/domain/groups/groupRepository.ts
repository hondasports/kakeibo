/**
 * groups リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { GroupFields } from "./group";

export interface GroupReadRepository {
  /** ID でグループを取得する。 */
  get(groupId: string): Promise<GroupFields | null>;
}

export interface GroupRepository extends GroupReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: Omit<GroupFields, "id">): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(groupId: string, fields: Partial<Omit<GroupFields, "id">>): Promise<void>;
}
