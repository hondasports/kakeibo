import { useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getGroupSettingsErrorMessage } from "./useGroupSettingsFeedback";

type UseGroupRenameManagementArgs = {
  groupId: Id<"groups"> | undefined;
  groupName: string | undefined;
  setActiveGroup: (args: { groupId: Id<"groups"> }) => Promise<unknown>;
  setError: (error: string) => void;
  setSavingTarget: (target: string | null) => void;
  setSnackbar: (message: string) => void;
  updateGroupName: (args: { name: string }) => Promise<unknown>;
};

export function useGroupRenameManagement({
  groupId,
  groupName,
  setActiveGroup,
  setError,
  setSavingTarget,
  setSnackbar,
  updateGroupName,
}: UseGroupRenameManagementArgs) {
  const [activeGroupId, setActiveGroupId] = useState<Id<"groups"> | "">("");
  const [groupNameDraft, setGroupNameDraft] = useState("");

  const [syncedGroup, setSyncedGroup] = useState<{
    id: Id<"groups"> | undefined;
    name: string | undefined;
  }>({ id: undefined, name: undefined });
  if (
    groupId &&
    groupName !== undefined &&
    (syncedGroup.id !== groupId || syncedGroup.name !== groupName)
  ) {
    setSyncedGroup({ id: groupId, name: groupName });
    setActiveGroupId(groupId);
    setGroupNameDraft(groupName);
  }

  const handleUpdateGroupName = async () => {
    const normalizedName = groupNameDraft.trim();
    if (!normalizedName) {
      setError("グループ名を入力してください。");
      return;
    }

    setSavingTarget("rename");
    setError("");
    try {
      await updateGroupName({ name: normalizedName });
      setSnackbar("グループ名を更新しました");
    } catch (caughtError) {
      setError(getGroupSettingsErrorMessage(caughtError, "グループ名を更新できませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  const handleSwitchGroup = async () => {
    if (!activeGroupId) {
      return;
    }
    setSavingTarget("switch");
    setError("");
    try {
      await setActiveGroup({ groupId: activeGroupId });
      setSnackbar("表示中のグループを切り替えました");
    } catch (caughtError) {
      setError(getGroupSettingsErrorMessage(caughtError, "グループを切り替えられませんでした。"));
    } finally {
      setSavingTarget(null);
    }
  };

  return {
    activeGroupId,
    groupNameDraft,
    handleSwitchGroup,
    handleUpdateGroupName,
    setActiveGroupId,
    setGroupNameDraft,
  };
}
