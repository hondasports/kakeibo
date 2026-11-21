/**
 * ユーザーのグループメンバーシップから active なグループを解決する純粋ドメインルール。
 */

type MembershipWithGroupId = {
  groupId: string;
};

/**
 * activeGroupId とメンバーシップ一覧から現在アクティブなメンバーシップを決定する。
 * activeGroupId が未設定の場合、有効なメンバーシップが1件だけならそれを返す。
 * 複数ある場合は null を返す（どのグループを active にすべきか UI/ユーザー操作で決める）。
 */
export function resolveActiveMembership<T extends MembershipWithGroupId>(
  memberships: T[],
  activeGroupId: string | null | undefined,
): T | null {
  if (memberships.length === 0) {
    return null;
  }

  if (activeGroupId == null) {
    return memberships.length === 1 ? memberships[0] : null;
  }

  return memberships.find((membership) => membership.groupId === activeGroupId) ?? null;
}
