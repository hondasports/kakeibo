/**
 * アカウント削除のグループ分類・ガードのユースケース。
 * 既存 accountDeletion.ts の loadAccountDeletionClassification /
 * deleteOrphanedGroupMemberships / assertAccountDeletionNotInProgress の移植。
 */
import { ConvexError } from "convex/values";
import {
  classifyAccountDeletionGroups,
  type AccountDeletionGroupClassification,
} from "../../domain/accountDeletion/classification";
import { isActiveAccountDeletionStatus } from "../../domain/accountDeletion/status";
import type { GroupMemberRecord } from "../../domain/groups/groupMember";
import type { AccountDeletionMutationDeps, AccountDeletionQueryDeps } from "./deps";

/** 分類は削除開始前の読み取り専用スナップショット。1トランザクションの上限内で bounded read。 */
const CLASSIFICATION_LIMIT = 10_000;

/** ベースの takeBounded 既定値（バッチサイズ）。 */
const DEFAULT_BATCH_LIMIT = 25;

type Deps = Pick<AccountDeletionQueryDeps, "memberships" | "groups">;

async function loadGroupMembershipStats(deps: Deps, groupId: string) {
  const members = await deps.memberships.listByGroup(groupId, CLASSIFICATION_LIMIT);
  return {
    memberCount: members.length,
    ownerCount: members.filter((row) => row.role === "owner").length,
  };
}

export async function loadAccountDeletionClassification(
  deps: Deps,
  userId: string,
): Promise<{
  classification: AccountDeletionGroupClassification;
  orphanMemberships: GroupMemberRecord[];
}> {
  const memberships = await deps.memberships.listByUser(userId, CLASSIFICATION_LIMIT);
  const values = [];
  const orphanMemberships: GroupMemberRecord[] = [];
  for (const membership of memberships) {
    const group = await deps.groups.get(membership.groupId);
    // 過去の削除処理で残った孤立 membership は、共有データを持たない。
    // preview では退会可能性の判定から除外し、開始 mutation で回収する。
    if (!group) {
      orphanMemberships.push(membership);
      continue;
    }
    const { memberCount, ownerCount } = await loadGroupMembershipStats(deps, membership.groupId);
    values.push({
      groupId: membership.groupId,
      groupName: group.name,
      role: membership.role,
      memberCount,
      ownerCount,
    });
  }
  return {
    classification: classifyAccountDeletionGroups(
      values.map((item) => ({ ...item, groupId: item.groupId as string })),
    ),
    orphanMemberships,
  };
}

export async function deleteOrphanedGroupMemberships(
  deps: Pick<AccountDeletionMutationDeps, "memberships">,
  memberships: Array<{ id: string }>,
): Promise<void> {
  for (const membership of memberships) {
    await deps.memberships.delete(membership.id);
  }
}

export async function assertAccountDeletionNotInProgress(
  deps: Pick<AccountDeletionQueryDeps, "requests">,
  userId: string,
): Promise<void> {
  const requests = await deps.requests.listByUser(userId, DEFAULT_BATCH_LIMIT);
  if (requests.some((request) => isActiveAccountDeletionStatus(request.status))) {
    throw new ConvexError("アカウント削除処理中のため、この操作はできません");
  }
}
