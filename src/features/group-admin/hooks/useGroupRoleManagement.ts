import { useState } from "react";
import type { GroupMemberListItem } from "../utils/groupMemberDisplay";
import type { GroupRole } from "../../../../lib/domain/groups/role";
import { getGroupSettingsErrorMessage } from "./useGroupSettingsFeedback";

type PendingRoleChange = {
  userId: string;
  displayLabel: string;
  currentRole: GroupRole;
  newRole: GroupRole;
};

type UseGroupRoleManagementArgs = {
  changeMemberRole: (args: { targetUserId: string; newRole: GroupRole }) => Promise<unknown>;
  setError: (error: string) => void;
  setSavingTarget: (target: string | null) => void;
  setSnackbar: (message: string) => void;
  savingTarget: string | null;
};

export function useGroupRoleManagement({
  changeMemberRole,
  setError,
  setSavingTarget,
  setSnackbar,
  savingTarget,
}: UseGroupRoleManagementArgs) {
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);

  const handleRequestRoleChange = (
    member: GroupMemberListItem,
    newRole: GroupRole,
    displayLabel: string,
  ) => {
    setPendingRoleChange({
      userId: member.userId,
      displayLabel,
      currentRole: member.role,
      newRole,
    });
  };

  const handleCancelRoleChange = () => {
    if (savingTarget !== null) {
      return;
    }
    setPendingRoleChange(null);
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChange) {
      return;
    }

    const { userId: targetUserId, newRole } = pendingRoleChange;
    setSavingTarget(targetUserId);
    setError("");
    try {
      await changeMemberRole({ targetUserId, newRole });
      setPendingRoleChange(null);
      setSnackbar("メンバーのロールを変更しました");
    } catch (caughtError) {
      setError(getGroupSettingsErrorMessage(caughtError, "ロールを変更できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  return {
    handleCancelRoleChange,
    handleConfirmRoleChange,
    handleRequestRoleChange,
    pendingRoleChange,
  };
}
