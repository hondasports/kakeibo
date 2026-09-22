import { api } from "../../../../convex/_generated/api";
import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";

export type GroupDetail = {
  name: string;
  id: string;
  status: string;
  environment: string;
  members: {
    userDocumentId: string | null;
    userId: string;
    displayName: string | null;
    email: string | null;
    role: "owner" | "member";
  }[];
  invitations: { id: string; email: string; status: string; createdAt: number }[];
  membersTruncated?: boolean;
  invitationsTruncated?: boolean;
};

export type GroupDetailMember = GroupDetail["members"][number];
export type GroupDetailInvitation = GroupDetail["invitations"][number];

export function useSystemAdminGroupDetail(groupId: string | undefined) {
  const getGroupDetail = useAction(api.systemAdminSearch.getGroupDetail);
  const revokeInvitation = useAction(
    api.systemAdminPendingInvitationAction.systemAdminPendingInvitationRevoke,
  );
  const operate = useMutation(api.systemAdminMembership.systemAdminMembershipOperation);
  const roleOperate = useMutation(api.systemAdminRoleOperations.systemAdminRoleOperation);
  const recoverOwnerless = useMutation(api.systemAdminOwnerlessGroupRecovery.recoverOwnerlessGroup);

  const [detail, setDetail] = useState<GroupDetail | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState("");

  const [dialogMember, setDialogMember] = useState<GroupDetailMember | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [operationError, setOperationError] = useState<string>();

  const [recoveryTarget, setRecoveryTarget] = useState<GroupDetailMember | null>(null);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  const [roleTarget, setRoleTarget] = useState<GroupDetailMember | null>(null);
  const [roleOperation, setRoleOperation] = useState<"role_change" | "owner_transfer" | null>(null);
  const [roleNewRole, setRoleNewRole] = useState<"owner" | "member">();
  const [roleSource, setRoleSource] = useState<GroupDetailMember | null>(null);
  const [roleError, setRoleError] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);

  const [invitationTarget, setInvitationTarget] = useState<GroupDetailInvitation | null>(null);
  const [invitationSaving, setInvitationSaving] = useState(false);
  const [invitationError, setInvitationError] = useState("");

  const fetchDetail = useCallback(async () => {
    if (!groupId) return;
    try {
      const response = await getGroupDetail({ groupId: groupId as Id<"groups"> });
      setDetail(response as GroupDetail | null);
    } catch {
      setError(true);
    }
  }, [getGroupDetail, groupId]);

  const load = useCallback(async () => {
    setDetail(undefined);
    setError(false);
    await fetchDetail();
  }, [fetchDetail]);

  const [prevGroupId, setPrevGroupId] = useState(groupId);
  if (prevGroupId !== groupId) {
    setPrevGroupId(groupId);
    setDetail(undefined);
    setError(false);
  }

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    getGroupDetail({ groupId: groupId as Id<"groups"> })
      .then((response) => {
        if (!cancelled) setDetail(response as GroupDetail | null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [getGroupDetail, groupId]);

  const requestRemove = (member: GroupDetailMember) => {
    setOperationError(undefined);
    setDialogMember(member);
  };

  const cancelRemove = () => {
    if (confirming) return;
    setDialogMember(null);
    setOperationError(undefined);
  };

  const executeRemove = async (reason: string) => {
    if (!detail || !dialogMember || !dialogMember.userDocumentId || !groupId) return;
    setConfirming(true);
    setOperationError(undefined);
    try {
      await operate({
        targetUserId: dialogMember.userDocumentId as Id<"users">,
        operation: "remove",
        sourceGroupId: groupId as Id<"groups">,
        reason,
      });
      setDialogMember(null);
      setSuccess("所属を解除しました。家計データは変更していません。");
      await load();
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "操作に失敗しました");
    } finally {
      setConfirming(false);
    }
  };

  const requestRoleChange = (
    member: GroupDetailMember,
    operation: "role_change" | "owner_transfer",
    newRole?: "owner" | "member",
  ) => {
    setRoleTarget(member);
    setRoleOperation(operation);
    setRoleNewRole(newRole);
    setRoleSource(null);
    setRoleError("");
  };

  const selectRoleSource = (member: GroupDetailMember) => {
    setRoleSource(member);
  };

  const cancelRoleOperation = () => {
    if (roleSaving) return;
    setRoleTarget(null);
  };

  const executeRoleOperation = async (reason: string) => {
    if (!groupId || !roleTarget?.userDocumentId || !roleOperation) return;
    setRoleSaving(true);
    setRoleError("");
    try {
      await roleOperate({
        operation: roleOperation === "role_change" ? "change_role" : "transfer_owner",
        groupId: groupId as Id<"groups">,
        targetUserId: roleTarget.userDocumentId as Id<"users">,
        sourceOwnerUserId: roleSource?.userDocumentId as Id<"users"> | undefined,
        newRole: roleNewRole,
        reason,
      });
      setRoleTarget(null);
      setSuccess("role変更を完了しました。監査ログと通知outboxに記録しました。");
      await load();
    } catch (cause) {
      setRoleError(cause instanceof Error ? cause.message : "role変更に失敗しました");
    } finally {
      setRoleSaving(false);
    }
  };

  const requestRevokeInvitation = (invitation: GroupDetailInvitation) => {
    setInvitationTarget(invitation);
    setInvitationError("");
  };

  const cancelRevokeInvitation = () => {
    if (invitationSaving) return;
    setInvitationTarget(null);
  };

  const executeRevokeInvitation = async (reason: string) => {
    if (!groupId || !invitationTarget) return;
    setInvitationSaving(true);
    setInvitationError("");
    try {
      await revokeInvitation({
        groupId: groupId as Id<"groups">,
        invitationId: invitationTarget.id as Id<"groupInvitations">,
        reason,
      });
      setInvitationTarget(null);
      setSuccess("pending招待を取り消しました。ユーザーや家計データは変更していません。");
      await load();
    } catch (cause) {
      setInvitationError(
        cause instanceof Error ? cause.message : "pending招待の取消に失敗しました",
      );
    } finally {
      setInvitationSaving(false);
    }
  };

  const requestRecovery = (member: GroupDetailMember) => {
    setRecoveryTarget(member);
    setRecoveryReason("");
    setRecoveryError("");
  };

  const cancelRecovery = () => {
    if (recovering) return;
    setRecoveryTarget(null);
  };

  const executeRecovery = async () => {
    if (!groupId || !recoveryTarget?.userDocumentId) return;
    const reason = recoveryReason.trim();
    if (reason.length < 1 || reason.length > 500) return;
    setRecovering(true);
    setRecoveryError("");
    try {
      await recoverOwnerless({
        groupId: groupId as Id<"groups">,
        targetUserId: recoveryTarget.userDocumentId as Id<"users">,
        reason,
      });
      setRecoveryTarget(null);
      setRecoveryReason("");
      setSuccess("owner不在グループを復旧しました。監査ログと通知outboxに記録しました。");
      await load();
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : "復旧に失敗しました");
    } finally {
      setRecovering(false);
    }
  };

  return {
    detail,
    error,
    success,
    setSuccess,
    dialogMember,
    confirming,
    operationError,
    requestRemove,
    cancelRemove,
    executeRemove,
    roleTarget,
    roleOperation,
    roleNewRole,
    roleSource,
    roleSaving,
    roleError,
    requestRoleChange,
    selectRoleSource,
    cancelRoleOperation,
    executeRoleOperation,
    invitationTarget,
    invitationSaving,
    invitationError,
    requestRevokeInvitation,
    cancelRevokeInvitation,
    executeRevokeInvitation,
    recoveryTarget,
    recoveryReason,
    setRecoveryReason,
    recovering,
    recoveryError,
    requestRecovery,
    cancelRecovery,
    executeRecovery,
  };
}
