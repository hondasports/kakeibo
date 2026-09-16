/**
 * groups ドメインが必要とする users 参照のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */

/** groups 管理が必要とする users ドキュメントの投影。docId は永続化ドキュメントの ID。 */
export type GroupUserRecord = {
  docId: string;
  userId: string;
  displayName?: string;
  email?: string;
  activeGroupId?: string;
  createdAt?: number;
  updatedAt?: number;
};
