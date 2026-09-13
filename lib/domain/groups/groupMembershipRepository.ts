/**
 * groupMembers リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { GroupMemberFields, GroupMemberRecord } from "./groupMember";
import type { GroupRole } from "./role";

export interface GroupMembershipReadRepository {
  /** ユーザーのメンバーシップを全件取得する。 */
  listByUser(userId: string): Promise<GroupMemberRecord[]>;
  /** グループ×ユーザーのメンバーシップを1件取得する。 */
  findByGroupAndUser(groupId: string, userId: string): Promise<GroupMemberRecord | null>;
  /** グループのメンバーシップを全件取得する。 */
  listByGroup(groupId: string): Promise<GroupMemberRecord[]>;
  /** グループ内の指定ロールのメンバーシップを取得する。limit 指定時は最大 limit 件。 */
  listByGroupAndRole(
    groupId: string,
    role: GroupRole,
    limit?: number,
  ): Promise<GroupMemberRecord[]>;
}

export interface GroupMembershipRepository extends GroupMembershipReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: GroupMemberFields): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(membershipId: string, fields: Partial<GroupMemberFields>): Promise<void>;
  /** 削除する。 */
  delete(membershipId: string): Promise<void>;
}
