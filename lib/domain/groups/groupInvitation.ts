/**
 * groupInvitations のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
export type GroupInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** groupInvitations ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type GroupInvitationFields = {
  id?: string;
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
