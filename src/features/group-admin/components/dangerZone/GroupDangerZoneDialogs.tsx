import { api } from "../../../../../convex/_generated/api";
import { Component, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { ConfirmDangerousActionDialog } from "../ConfirmDangerousActionDialog";
import { ConfirmDeleteGroupDialog } from "../ConfirmDeleteGroupDialog";
import { formatGroupRoleLabel } from "../../../../../lib/domain/groups/role";
import type { PendingMember } from "./types";

type GroupDangerZoneDialogsProps = {
  pendingRemoveMember: PendingMember | null;
  pendingOwnershipTransfer: PendingMember | null;
  pendingDeleteGroup: boolean;
  deleteConfirmationName: string;
  savingTarget: string | null;
  currentUserDisplayName: string | null;
  onConfirmRemoveMember: () => void;
  onConfirmOwnershipTransfer: () => void;
  onConfirmDeleteGroup: () => void;
  onCancelRemoveMember: () => void;
  onCancelOwnershipTransfer: () => void;
  onCancelDeleteGroup: () => void;
  onConfirmationNameChange: (value: string) => void;
};

type DeleteDialogProps = Pick<
  GroupDangerZoneDialogsProps,
  | "pendingDeleteGroup"
  | "deleteConfirmationName"
  | "savingTarget"
  | "onCancelDeleteGroup"
  | "onConfirmDeleteGroup"
  | "onConfirmationNameChange"
>;

class PreviewErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function DeleteGroupDialogWithPreview(props: DeleteDialogProps) {
  const preview = useQuery(
    api.groups.deletion.getGroupDeletionPreview,
    props.pendingDeleteGroup ? {} : "skip",
  );
  return (
    <ConfirmDeleteGroupDialog
      confirmationName={props.deleteConfirmationName}
      confirming={props.pendingDeleteGroup && props.savingTarget === "delete-group"}
      onCancel={props.onCancelDeleteGroup}
      onConfirm={props.onConfirmDeleteGroup}
      onConfirmationNameChange={props.onConfirmationNameChange}
      open={props.pendingDeleteGroup}
      preview={preview}
    />
  );
}

export function GroupDangerZoneDialogs({
  pendingRemoveMember,
  pendingOwnershipTransfer,
  pendingDeleteGroup,
  deleteConfirmationName,
  savingTarget,
  currentUserDisplayName,
  onConfirmRemoveMember,
  onConfirmOwnershipTransfer,
  onConfirmDeleteGroup,
  onCancelRemoveMember,
  onCancelOwnershipTransfer,
  onCancelDeleteGroup,
  onConfirmationNameChange,
}: GroupDangerZoneDialogsProps) {
  return (
    <>
      <ConfirmDangerousActionDialog
        confirmLabel="グループから外す"
        confirming={pendingRemoveMember !== null && savingTarget === pendingRemoveMember.userId}
        description={
          pendingRemoveMember
            ? `${pendingRemoveMember.displayLabel} をこのグループから外します。Clerk アカウント自体は削除されず、他のグループへの所属はそのままです。`
            : ""
        }
        onCancel={onCancelRemoveMember}
        onConfirm={onConfirmRemoveMember}
        open={pendingRemoveMember !== null}
        title="メンバーをグループから外しますか？"
      />
      <ConfirmDangerousActionDialog
        cancelLabel="戻る"
        confirmLabel="オーナー権限を譲渡する"
        confirming={
          pendingOwnershipTransfer !== null && savingTarget === pendingOwnershipTransfer.userId
        }
        description={
          pendingOwnershipTransfer
            ? `現在のオーナー: ${currentUserDisplayName}。譲渡先: ${pendingOwnershipTransfer.displayLabel}。譲渡後のあなたのロール: ${formatGroupRoleLabel("member")}。譲渡後は管理操作を実行できなくなります。`
            : ""
        }
        onCancel={onCancelOwnershipTransfer}
        onConfirm={onConfirmOwnershipTransfer}
        open={pendingOwnershipTransfer !== null}
        title="オーナー権限を譲渡しますか？"
      />
      <PreviewErrorBoundary
        key={pendingDeleteGroup ? "open" : "closed"}
        fallback={
          <ConfirmDeleteGroupDialog
            confirmationName={deleteConfirmationName}
            confirming={false}
            onCancel={onCancelDeleteGroup}
            onConfirm={onConfirmDeleteGroup}
            onConfirmationNameChange={onConfirmationNameChange}
            open={pendingDeleteGroup}
            preview={null}
            previewError
          />
        }
      >
        <DeleteGroupDialogWithPreview
          deleteConfirmationName={deleteConfirmationName}
          onCancelDeleteGroup={onCancelDeleteGroup}
          onConfirmDeleteGroup={onConfirmDeleteGroup}
          onConfirmationNameChange={onConfirmationNameChange}
          pendingDeleteGroup={pendingDeleteGroup}
          savingTarget={savingTarget}
        />
      </PreviewErrorBoundary>
    </>
  );
}
