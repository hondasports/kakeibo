/**
 * groupMembers のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type { GroupRole } from "./role";

/** groupMembers ドキュメントのフィールド（書き込み用。id は採番前のため含まない）。 */
export type GroupMemberFields = {
  groupId: string;
  userId: string;
  role: GroupRole;
  createdAt: number;
  updatedAt: number;
};

/** 永続化済みの groupMembers レコード。読み取り結果では id が必須。 */
export type GroupMemberRecord = GroupMemberFields & { id: string };
