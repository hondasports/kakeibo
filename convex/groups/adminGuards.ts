import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { createGroupMembershipReadRepository } from "../../lib/convex/groups/convexGroupMembershipRepository";
import {
  getGroupAdminErrorMessage,
  validateActiveGroupScope,
  validateGroupOwnerRole,
  validateNotSelfOperator,
  validateRemovableGroupMemberRole,
  type GroupAdminRole,
} from "../../lib/domain/groups/admin";

export type { GroupAdminRole } from "../../lib/domain/groups/admin";

export const GROUP_ADMIN_ERRORS = {
  OWNER_ONLY: "グループオーナーのみ実行できます",
  NOT_ACTIVE_GROUP: "現在選択中のグループでのみ実行できます",
  SELF_OPERATION_FORBIDDEN: "自分自身に対してこの操作はできません",
  OWNER_MEMBER_NOT_REMOVABLE: "オーナーはグループから外せません",
  LAST_OWNER_PROTECTED: "最後のオーナーは変更できません",
  TRANSFER_TARGET_MUST_BE_MEMBER: "譲渡先はメンバーロールのユーザーに限定されます",
  GROUP_DELETED: "削除済みのグループにはアクセスできません",
  GROUP_DELETING: "このグループは削除処理中です",
  GROUP_ALREADY_DELETED: "このグループはすでに削除されています",
  GROUP_NAME_MISMATCH: "入力されたグループ名が一致しません",
} as const;

export function assertGroupOwnerRole(role: GroupAdminRole): void {
  const result = validateGroupOwnerRole(role);
  if (!result.success) {
    throw new ConvexError(getGroupAdminErrorMessage(result.error));
  }
}

export function assertActiveGroupScope(
  activeGroupId: Id<"groups">,
  targetGroupId: Id<"groups">,
): void {
  const result = validateActiveGroupScope(activeGroupId, targetGroupId);
  if (!result.success) {
    throw new ConvexError(getGroupAdminErrorMessage(result.error));
  }
}

export function assertNotSelfOperator(actorUserId: string, targetUserId: string): void {
  const result = validateNotSelfOperator(actorUserId, targetUserId);
  if (!result.success) {
    throw new ConvexError(getGroupAdminErrorMessage(result.error));
  }
}

export function assertRemovableGroupMemberRole(role: GroupAdminRole): void {
  const result = validateRemovableGroupMemberRole(role);
  if (!result.success) {
    throw new ConvexError(getGroupAdminErrorMessage(result.error));
  }
}

export async function assertAnotherGroupOwnerRemains(
  ctx: Pick<QueryCtx, "db">,
  groupId: Id<"groups">,
  demotedMembershipId: Id<"groupMembers">,
): Promise<void> {
  const owners = await createGroupMembershipReadRepository(ctx).listByGroupAndRole(
    groupId,
    "owner",
    2,
  );

  if (!owners.some((owner) => owner.id !== demotedMembershipId)) {
    throw new ConvexError(GROUP_ADMIN_ERRORS.LAST_OWNER_PROTECTED);
  }
}
