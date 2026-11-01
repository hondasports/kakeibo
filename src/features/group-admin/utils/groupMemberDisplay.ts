import type { GroupRole } from "../../../../lib/domain/groups/role";

export type GroupMemberListItem = {
  userId: string;
  role: GroupRole;
  displayName: string;
  email: string | null;
  createdAt: number;
};

export function getMemberInitial(primaryLabel: string) {
  return primaryLabel.trim().slice(0, 1).toUpperCase() || "?";
}

export function getMemberPrimaryLabel(
  member: GroupMemberListItem,
  currentUserDisplayName: string | null,
) {
  if (currentUserDisplayName) {
    return currentUserDisplayName;
  }
  if (member.displayName !== "ユーザー") {
    return member.displayName;
  }
  return member.email ?? "ユーザー";
}

export function getMemberSecondaryLabel(member: GroupMemberListItem, primaryLabel: string) {
  if (member.email) {
    return member.email === primaryLabel ? "メール登録済み" : member.email;
  }
  return `ID: ${member.userId.slice(-8)}`;
}

export function isCurrentUserMember(memberUserId: string, clerkUserId: string | null | undefined) {
  return Boolean(
    clerkUserId && (memberUserId === clerkUserId || memberUserId.endsWith(`|${clerkUserId}`)),
  );
}
