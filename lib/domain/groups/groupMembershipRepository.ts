/**
 * groupMembers リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { GroupMemberFields } from "./groupMember";
import type { GroupRole } from "./role";

export interface GroupMembershipReadRepository {
  /** ユーザーのメンバーシップを全件取得する。 */
  listByUser(userId: string): Promise<GroupMemberFields[]>;
  /** グループ×ユーザーのメンバーシップを1件取得する。 */
  findByGroupAndUser(groupId: string, userId: string): Promise<GroupMemberFields | null>;
  /** グループのメンバーシップを全件取得する。 */
  listByGroup(groupId: string): Promise<GroupMemberFields[]>;
  /** グループ内の指定ロールのメンバーシップを取得する。limit 指定時は最大 limit 件。 */
  listByGroupAndRole(
    groupId: string,
    role: GroupRole,
    limit?: number,
  ): Promise<GroupMemberFields[]>;
}

export interface GroupMembershipRepository extends GroupMembershipReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: Omit<GroupMemberFields, "id">): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(membershipId: string, fields: Partial<Omit<GroupMemberFields, "id">>): Promise<void>;
  /** 削除する。 */
  delete(membershipId: string): Promise<void>;
}
