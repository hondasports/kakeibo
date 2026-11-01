/**
 * groupInvitations のドメイン型。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
export const GROUP_INVITATION_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type GroupInvitationStatus = (typeof GROUP_INVITATION_STATUSES)[number];

/**
 * 1 グループが同時に持てる pending 招待の上限。
 * 家族・世帯向けアプリで一度に未承諾のまま招待する人数としては十分に大きく、
 * 認証済みユーザーによる Clerk 招待メールの大量送信と groupInvitations の無制限増加を防ぐ。
 */
export const MAX_PENDING_GROUP_INVITATIONS = 20;

/**
 * 1 ユーザーが owner として保持できるグループ数の上限。
 * 複数グループ所属（家族・実家・共同生活など）は想定するが、無制限のグループ作成は防ぐ。
 */
export const MAX_OWNED_GROUPS_PER_USER = 10;

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

export type InvitationRecipient = {
  token: string;
  acceptedUserId: string;
  acceptedEmails: string[];
};

export type InvitationAcceptanceConsent = {
  switchActiveGroup?: boolean;
  expectedActiveGroupId?: string;
};

export type GroupInvitationPreview = {
  groupId: string;
  groupName: string;
  activeGroupId: string | null;
  activeGroupName: string | null;
  isExistingMember: boolean;
};
