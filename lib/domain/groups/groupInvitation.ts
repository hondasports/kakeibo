/**
 * groupInvitations のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
export type GroupInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** groupInvitations ドキュメントのフィールド（書き込み用。id は採番前のため含まない）。 */
export type GroupInvitationFields = {
  groupId: string;
  email: string;
  token: string;
  status: GroupInvitationStatus;
  invitedByUserId: string;
  clerkInvitationId?: string;
  acceptedByUserId?: string;
  acceptedAt?: number;
  createdAt: number;
  updatedAt: number;
};

/** 永続化済みの groupInvitations レコード。読み取り結果では id が必須。 */
export type GroupInvitationRecord = GroupInvitationFields & { id: string };
