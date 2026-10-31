import type { GroupRole } from "./role";

export type GroupAdminErrorKey =
  | "owner_only"
  | "not_active_group"
  | "self_operation_forbidden"
  | "owner_member_not_removable";

const groupAdminErrorMessages: Record<GroupAdminErrorKey, string> = {
  owner_only: "グループオーナーのみ実行できます",
  not_active_group: "現在選択中のグループでのみ実行できます",
  self_operation_forbidden: "自分自身に対してこの操作はできません",
  owner_member_not_removable: "オーナーはグループから外せません",
};

/** グループ admin ガードエラーをユーザー向けメッセージに変換する */
export function getGroupAdminErrorMessage(error: GroupAdminErrorKey): string {
  return groupAdminErrorMessages[error];
}

export function validateGroupOwnerRole(
  role: GroupRole,
): { success: true } | { success: false; error: GroupAdminErrorKey } {
  if (role !== "owner") {
    return { success: false, error: "owner_only" };
  }
  return { success: true };
}

export function validateActiveGroupScope(
  activeGroupId: string,
  targetGroupId: string,
): { success: true } | { success: false; error: GroupAdminErrorKey } {
  if (activeGroupId !== targetGroupId) {
    return { success: false, error: "not_active_group" };
  }
  return { success: true };
}

export function validateNotSelfOperator(
  actorUserId: string,
  targetUserId: string,
): { success: true } | { success: false; error: GroupAdminErrorKey } {
  if (actorUserId === targetUserId) {
    return { success: false, error: "self_operation_forbidden" };
  }
  return { success: true };
}

export function validateRemovableGroupMemberRole(
  role: GroupRole,
): { success: true } | { success: false; error: GroupAdminErrorKey } {
  if (role === "owner") {
    return { success: false, error: "owner_member_not_removable" };
  }
  return { success: true };
}
