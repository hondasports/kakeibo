/**
 * groupMembers リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type { GroupMemberFields, GroupMemberRecord } from "./groupMember";
import type { GroupRole } from "./role";

/** ページネーション結果（メンバーシップ走査用）。 */
export type GroupMembershipPage = {
  page: GroupMemberRecord[];
  isDone: boolean;
  continueCursor: string;
};

export interface GroupMembershipReadRepository {
  /** ユーザーのメンバーシップを取得する。limit 指定時は最大 limit 件の bounded read。 */
  listByUser(userId: string, limit?: number): Promise<GroupMemberRecord[]>;
  /** ユーザーのメンバーシップをカーソル付きページネーションで取得する。 */
  paginateByUser(
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<GroupMembershipPage>;
  /** グループ×ユーザーのメンバーシップを1件取得する。 */
  findByGroupAndUser(groupId: string, userId: string): Promise<GroupMemberRecord | null>;
  /** グループのメンバーシップを取得する。limit 指定時は最大 limit 件の bounded read。 */
  listByGroup(groupId: string, limit?: number): Promise<GroupMemberRecord[]>;
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
