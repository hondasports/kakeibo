/**
 * 自分の所属グループ一覧取得ユースケース（query）。
 * 解決済みメンバーシップを受け取り、グループ情報を整形して返す。
 */
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { GroupRole } from "../../domain/groups/role";

export type MyGroupListItem = {
  groupId: string;
  name: string;
  clerkOrganizationId: string | null;
  role: GroupRole;
  createdAt: number;
  isActive: boolean;
};

export async function listMyGroups(
  deps: { groups: GroupReadRepository },
  args: {
    memberships: { groupId: string; role: GroupRole }[];
    activeGroupId?: string;
  },
): Promise<MyGroupListItem[]> {
  const groups = await Promise.all(
    args.memberships.map(async (membership) => {
      const group = await deps.groups.get(membership.groupId);
      if (group === null) return null;
      return {
        groupId: group.id!,
        name: group.name,
        clerkOrganizationId: group.clerkOrganizationId ?? null,
        role: membership.role,
        createdAt: group.createdAt,
        isActive: args.activeGroupId === group.id,
      };
    }),
  );

  return groups.filter((group): group is NonNullable<typeof group> => group !== null);
}
