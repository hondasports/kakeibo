/**
 * グループ内ロールに関するドメインルール。
 * UI / Convex の両方から利用できる純粋関数のみを含む。
 */

/** グループ内ロールの全値。schema・API validator はこの並び（owner → member）に合わせる。 */
export const GROUP_ROLES = ["owner", "member"] as const;

/** グループ内ロール。 */
export type GroupRole = (typeof GROUP_ROLES)[number];

/**
 * 管理操作の監査ログに残す所属状態の全値。"none" は未所属、それ以外は所属時の GroupRole。
 * 既存 schema validator の並び（none → member → owner）を維持するため GROUP_ROLES を反転して並べる。
 */
export const GROUP_MEMBERSHIP_STATUSES = ["none", ...[...GROUP_ROLES].reverse()] as const;

/** 管理操作の監査ログに残す所属状態。 */
export type GroupMembershipStatus = (typeof GROUP_MEMBERSHIP_STATUSES)[number];

/** ロールの人間可読ラベルを返す。 */
export function formatGroupRoleLabel(role: GroupRole): string {
  return role === "owner" ? "オーナー" : "メンバー";
}
