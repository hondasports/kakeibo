/**
 * グループメンバー一覧取得ユースケース（query）。
 * メンバーシップとユーザー情報を join し、表示順にソートして返す。
 */
import type { GroupMembershipReadRepository } from "../../domain/groups/groupMembershipRepository";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";
import { sortGroupMembersForDisplay } from "../../domain/groups/members";
import type { GroupRole } from "../../domain/groups/role";
import type { UsecaseGroupContext } from "../context";

export type GroupMemberListItemResult = {
  userId: string;
  role: GroupRole;
  displayName: string;
  email: string | null;
  isActiveGroup: boolean;
  createdAt: number;
};

export async function getGroupMembers(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: { memberships: GroupMembershipReadRepository; users: UserDirectoryRead },
): Promise<GroupMemberListItemResult[]> {
  const members = await deps.memberships.listByGroup(ctx.groupId);

  const membersWithInfo = await Promise.all(
    members.map(async (m) => {
      const user = await deps.users.findByUserId(m.userId);
      return {
        userId: m.userId,
        role: m.role,
        displayName: user?.displayName ?? "ユーザー",
        email: user?.email ?? null,
        isActiveGroup: user?.activeGroupId === ctx.groupId,
        createdAt: m.createdAt,
      };
    }),
  );

  return sortGroupMembersForDisplay(membersWithInfo);
}
