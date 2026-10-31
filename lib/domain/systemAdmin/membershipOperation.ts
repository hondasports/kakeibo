export const SYSTEM_ADMIN_MEMBERSHIP_OPERATIONS = [
  "add",
  "remove",
  "transfer",
  "set_active",
  "clear_active",
] as const;
export type MembershipOperation = (typeof SYSTEM_ADMIN_MEMBERSHIP_OPERATIONS)[number];

export type ValidateMembershipOperationShapeError = "invalid_shape" | "same_source_target";

const membershipOperationShapeErrorMessages: Record<ValidateMembershipOperationShapeError, string> =
  {
    invalid_shape: "操作対象グループの指定が不正です",
    same_source_target: "移動元と移動先は異なるグループを指定してください",
  };

/** メンバーシップ操作形状エラーをユーザー向けメッセージに変換する */
export function getMembershipOperationShapeErrorMessage(
  error: ValidateMembershipOperationShapeError,
): string {
  return membershipOperationShapeErrorMessages[error];
}

export function validateMembershipOperationShape(
  operation: MembershipOperation,
  sourceGroupId: string | undefined,
  targetGroupId: string | undefined,
): { success: true } | { success: false; error: ValidateMembershipOperationShapeError } {
  const valid =
    (operation === "add" && !sourceGroupId && !!targetGroupId) ||
    (operation === "remove" && !!sourceGroupId && !targetGroupId) ||
    (operation === "transfer" && !!sourceGroupId && !!targetGroupId) ||
    (operation === "set_active" && !sourceGroupId && !!targetGroupId) ||
    (operation === "clear_active" && !sourceGroupId && !targetGroupId);
  if (!valid) {
    return { success: false, error: "invalid_shape" };
  }
  if (sourceGroupId && targetGroupId && sourceGroupId === targetGroupId) {
    return { success: false, error: "same_source_target" };
  }
  return { success: true };
}
