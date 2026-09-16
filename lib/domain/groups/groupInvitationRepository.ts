/**
 * groupInvitations リポジトリのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 * QueryCtx 等の読み取り専用コンテキスト向けに Read ポートを分離する。
 */
import type {
  GroupInvitationFields,
  GroupInvitationRecord,
  GroupInvitationStatus,
} from "./groupInvitation";

export interface GroupInvitationReadRepository {
  /** トークンで招待を1件取得する。 */
  findByToken(token: string): Promise<GroupInvitationRecord | null>;
  /** ID で招待を1件取得する。 */
  findById(invitationId: string): Promise<GroupInvitationRecord | null>;
  /** グループ×ステータスの招待を全件取得する。 */
  listByGroupAndStatus(
    groupId: string,
    status: GroupInvitationStatus,
  ): Promise<GroupInvitationRecord[]>;
  /** グループ×メールアドレス（正規化済み）の招待を全件取得する。 */
  listByGroupAndEmail(groupId: string, email: string): Promise<GroupInvitationRecord[]>;
}

export interface GroupInvitationRepository extends GroupInvitationReadRepository {
  /** 新規保存し、採番された ID を返す。 */
  insert(fields: GroupInvitationFields): Promise<string>;
  /** 既存ドキュメントへ部分更新する。 */
  patch(invitationId: string, fields: Partial<GroupInvitationFields>): Promise<void>;
  /** 削除する。 */
  delete(invitationId: string): Promise<void>;
}
