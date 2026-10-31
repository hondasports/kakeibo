import type { GroupRole } from "./role";

export type GroupMemberLike = {
  userId: string;
  role: GroupRole;
  displayName: string;
  email?: string | null;
  createdAt: number;
};

function getMemberSortLabel(member: GroupMemberLike): string {
  return member.displayName.trim() || member.email?.trim() || member.userId;
}

export function sortGroupMembersForDisplay<T extends GroupMemberLike>(members: T[]): T[] {
  return [...members].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "owner" ? -1 : 1;
    }

    const labelCompare = getMemberSortLabel(left).localeCompare(getMemberSortLabel(right), "ja");
    if (labelCompare !== 0) {
      return labelCompare;
    }

    return left.createdAt - right.createdAt;
  });
}
