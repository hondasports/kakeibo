/**
 * groupMembers のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { GroupRole } from "./role";

/** groupMembers ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type GroupMemberFields = {
  id?: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  createdAt: number;
  updatedAt: number;
};
