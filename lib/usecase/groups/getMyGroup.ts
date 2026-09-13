/**
 * 自分のアクティブグループ情報取得ユースケース（query）。
 * メンバーシップ解決は presentation 層で済んでいる前提で、グループ情報を整形して返す。
 */
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { GroupRole } from "../../domain/groups/role";

export type MyGroupInfo = {
  groupId: string;
  name: string;
  clerkOrganizationId: string | null;
  role: GroupRole;
  createdAt: number;
};

export async function getMyGroup(
  deps: { groups: GroupReadRepository },
  args: { groupId: string; role: GroupRole },
): Promise<MyGroupInfo | null> {
  const group = await deps.groups.get(args.groupId);
  if (group === null) return null;

  return {
    groupId: group.id,
    name: group.name,
    clerkOrganizationId: group.clerkOrganizationId ?? null,
    role: args.role,
    createdAt: group.createdAt,
  };
}
