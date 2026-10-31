import type { GroupRole } from "../groups/role";

export const ACCOUNT_DELETION_GROUP_MEMBERSHIP_INVARIANT_MESSAGE =
  "Group membership invariant violation";

export type AccountDeletionMembership = {
  groupId: string;
  groupName: string;
  role: GroupRole;
  memberCount: number;
  ownerCount: number;
};

export type AccountDeletionGroupClassification = {
  groupsToLeave: Array<Pick<AccountDeletionMembership, "groupId" | "groupName" | "role">>;
  groupsToDelete: Array<Pick<AccountDeletionMembership, "groupId" | "groupName">>;
  blockingGroups: Array<
    Pick<AccountDeletionMembership, "groupId" | "groupName" | "memberCount"> & {
      reason: "sole_owner_with_other_members";
    }
  >;
};

export function classifyAccountDeletionGroups(
  memberships: AccountDeletionMembership[],
): AccountDeletionGroupClassification {
  const result: AccountDeletionGroupClassification = {
    groupsToLeave: [],
    groupsToDelete: [],
    blockingGroups: [],
  };
  for (const membership of memberships) {
    if (
      membership.memberCount < 1 ||
      membership.ownerCount < 1 ||
      membership.ownerCount > membership.memberCount
    ) {
      throw new Error(ACCOUNT_DELETION_GROUP_MEMBERSHIP_INVARIANT_MESSAGE);
    }
    if (membership.role === "member" || membership.ownerCount >= 2) {
      result.groupsToLeave.push(membership);
    } else if (membership.memberCount === 1) {
      result.groupsToDelete.push(membership);
    } else {
      result.blockingGroups.push({
        groupId: membership.groupId,
        groupName: membership.groupName,
        memberCount: membership.memberCount,
        reason: "sole_owner_with_other_members",
      });
    }
  }
  return result;
}
