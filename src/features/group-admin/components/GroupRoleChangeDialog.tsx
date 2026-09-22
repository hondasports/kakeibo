import { ConfirmDangerousActionDialog } from "./ConfirmDangerousActionDialog";
import { formatGroupRoleLabel } from "../../../../lib/domain/groups/role";

type PendingRoleChange = {
  userId: string;
  displayLabel: string;
  currentRole: "owner" | "member";
  newRole: "owner" | "member";
};

type GroupRoleChangeDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
  pendingRoleChange: PendingRoleChange | null;
  savingTarget: string | null;
};

export function GroupRoleChangeDialog({
  onCancel,
  onConfirm,
  pendingRoleChange,
  savingTarget,
}: GroupRoleChangeDialogProps) {
  return (
    <ConfirmDangerousActionDialog
      cancelLabel="戻る"
      confirmLabel="ロールを変更する"
      confirming={pendingRoleChange !== null && savingTarget === pendingRoleChange.userId}
      description={
        pendingRoleChange
          ? `${pendingRoleChange.displayLabel} のロールを「${formatGroupRoleLabel(pendingRoleChange.currentRole)}」から「${formatGroupRoleLabel(pendingRoleChange.newRole)}」に変更します。`
          : ""
      }
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={pendingRoleChange !== null}
      title="メンバーのロールを変更しますか？"
    />
  );
}
