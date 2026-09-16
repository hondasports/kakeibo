/**
 * systemAdmin 検索・詳細参照のクエリポート（domain interface）。
 * 検索インデックス・created_at ページネーション・normalizeId など
 * Convex 固有の検索面は infrastructure 層が実装する。
 */
import type { PaginatedResult, PaginationOpts } from "../pagination";
import type { GroupUserRecord } from "../groups/groupUser";
import type { GroupMemberRecord } from "../groups/groupMember";
import type { GroupRecord } from "../groups/group";
import type { GroupInvitationRecord } from "../groups/groupInvitation";

export type UserSearchType = "displayName" | "email" | "userId";
export type GroupSearchType = "name" | "groupId";

export interface SystemAdminSearchStore {
  /** users を createdAt 降順でページネーションする（検索語なし）。 */
  paginateUsersByCreatedAt(opts: PaginationOpts): Promise<PaginatedResult<GroupUserRecord>>;
  /** users を表示名全文検索でページネーションする。 */
  searchUsersByDisplayName(
    query: string,
    opts: PaginationOpts,
  ): Promise<PaginatedResult<GroupUserRecord>>;
  /** users をメール全文検索（小文字化済みクエリ）でページネーションする。 */
  searchUsersByEmail(
    query: string,
    opts: PaginationOpts,
  ): Promise<PaginatedResult<GroupUserRecord>>;
  /** users を token identifier 一致でページネーションする。 */
  paginateUsersByUserId(
    userId: string,
    opts: PaginationOpts,
  ): Promise<PaginatedResult<GroupUserRecord>>;
  /** groups を createdAt 降順でページネーションする（検索語なし）。 */
  paginateGroupsByCreatedAt(opts: PaginationOpts): Promise<PaginatedResult<GroupRecord>>;
  /** groups を名前全文検索でページネーションする。 */
  searchGroupsByName(query: string, opts: PaginationOpts): Promise<PaginatedResult<GroupRecord>>;
  /** グループID文字列を正規化し、妥当ならそのドキュメントを返す。 */
  getGroupByIdString(idString: string): Promise<GroupRecord | null>;
  /** users ドキュメントIDで1件取得する。 */
  getUserByDocId(userDocId: string): Promise<GroupUserRecord | null>;
  /** userId（token identifier）で users を1件取得する。 */
  findUserByUserId(userId: string): Promise<GroupUserRecord | null>;
  /** ユーザーの groupMembers を最大 limit 件取得する。 */
  takeMembershipsByUser(userId: string, limit: number): Promise<GroupMemberRecord[]>;
  /** グループの groupMembers を最大 limit 件取得する。 */
  takeMembershipsByGroup(groupId: string, limit: number): Promise<GroupMemberRecord[]>;
  /** メールアドレスの groupInvitations を最大 limit 件取得する。 */
  takeInvitationsByEmail(email: string, limit: number): Promise<GroupInvitationRecord[]>;
  /** グループの groupInvitations を最大 limit 件取得する。 */
  takeInvitationsByGroup(groupId: string, limit: number): Promise<GroupInvitationRecord[]>;
}
