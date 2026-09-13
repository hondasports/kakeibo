/**
 * groups ドメインから users を参照・更新するためのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { GroupUserRecord } from "./groupUser";

export interface UserDirectoryRead {
  /** 認証 userId（tokenIdentifier）でユーザーを1件取得する。 */
  findByUserId(userId: string): Promise<GroupUserRecord | null>;
  /** メールアドレス（正規化済み）でユーザーを1件取得する。 */
  findByEmail(email: string): Promise<GroupUserRecord | null>;
}

export interface UserDirectory extends UserDirectoryRead {
  /** activeGroupId を更新する。undefined で解除する。 */
  setActiveGroup(docId: string, groupId: string | undefined, updatedAt: number): Promise<void>;
  /** ユーザードキュメントを物理削除する（アカウント削除用）。 */
  deleteById(docId: string): Promise<void>;
}
