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

/**
 * 招待の stale 分類。
 * - "stale": 再招待・再送前に revoke 対象
 * - "keep": 現行を維持
 * - "check_membership": acceptedByUserId のグループ membership 不存在なら stale
 */
export type StaleInvitationAssessment = "stale" | "keep" | "check_membership";

/** 招待が stale かを分類する。membership 参照が必要な場合のみ check_membership を返す。 */
export function assessGroupInvitationStaleness(invitation: {
  status: GroupInvitationStatus;
  acceptedByUserId?: string;
}): StaleInvitationAssessment {
  if (invitation.status === "pending") return "stale";
  if (invitation.status !== "accepted") return "keep";
  if (!invitation.acceptedByUserId) return "stale";
  return "check_membership";
}
