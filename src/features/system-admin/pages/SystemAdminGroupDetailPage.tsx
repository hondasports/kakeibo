import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { SystemAdminInvitationRevokeDialog } from "../components/SystemAdminInvitationRevokeDialog";
import { GroupInvitationsSection } from "../components/GroupInvitationsSection";
import { GroupMembersSection } from "../components/GroupMembersSection";
import { GroupOwnerlessRecoveryDialog } from "../components/GroupOwnerlessRecoveryDialog";
import { SystemAdminMembershipChangeDialog } from "../components/SystemAdminMembershipChangeDialog";
import { useSystemAdminGroupDetail } from "../hooks/useSystemAdminGroupDetail";
import {
  SystemAdminBackLink,
  SystemAdminEmptyState,
  SystemAdminErrorState,
  SystemAdminPageFrame,
} from "./SystemAdminPageFrame";
import { LoadingDetail } from "../components/LoadingDetail";

export function SystemAdminGroupDetailPage() {
  const { groupId } = useParams();
  const {
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
  } = useSystemAdminGroupDetail(groupId);

  if (error) {
    return (
      <SystemAdminPageFrame title="グループ詳細">
        <SystemAdminErrorState />
      </SystemAdminPageFrame>
    );
  }

  if (detail === undefined) {
    return (
      <SystemAdminPageFrame title="グループ詳細">
        <LoadingDetail />
      </SystemAdminPageFrame>
    );
  }

  if (detail === null) {
    return (
      <SystemAdminPageFrame title="グループ詳細">
        <SystemAdminEmptyState message="対象グループが見つかりません。" />
        <SystemAdminBackLink to="/admin/groups">グループ検索へ戻る</SystemAdminBackLink>
      </SystemAdminPageFrame>
    );
  }

  const stale = detail.status !== "active";
  const ownerless =
    !stale &&
    !detail.membersTruncated &&
    detail.members.length > 0 &&
    !detail.members.some((member) => member.role === "owner");
  const ownerCount = detail.members.filter((member) => member.role === "owner").length;

  const sourceGroup = { id: detail.id, name: detail.name };

  const removeTarget = dialogMember
    ? {
        id: dialogMember.userDocumentId ?? "",
        displayName: dialogMember.displayName ?? "ユーザー",
        email: dialogMember.email,
        activeGroupId: null,
      }
    : null;

  const roleDialogTarget = roleTarget
    ? {
        id: roleTarget.userDocumentId ?? "",
        displayName: roleTarget.displayName ?? "ユーザー",
        email: roleTarget.email,
        activeGroupId: null,
      }
    : null;

  const roleSourceUser = roleSource
    ? {
        id: roleSource.userDocumentId ?? "",
        displayName: roleSource.displayName ?? "ユーザー",
        email: roleSource.email,
      }
    : undefined;

  return (
    <SystemAdminPageFrame title="グループ詳細">
      <SystemAdminBackLink to="/admin/groups">グループ検索へ戻る</SystemAdminBackLink>
      {success ? (
        <Alert onClose={() => setSuccess("")} severity="success">
          {success}
        </Alert>
      ) : null}
      {stale ? (
        <Alert severity="warning">
          このグループは状態が「{detail.status}」のため変更できません。
        </Alert>
      ) : null}
      {ownerless ? (
        <Alert severity="error">
          ownerが0人です。通常のrole変更と分離した緊急復旧を実行してください。
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
            {detail.members
              .filter((member) => member.role === "member" && member.userDocumentId)
              .map((member) => (
                <Button
                  key={member.userId}
                  onClick={() => requestRecovery(member)}
                  size="small"
                  variant="contained"
                >
                  {member.displayName ?? "ユーザー"}をownerへ
                </Button>
              ))}
          </Stack>
        </Alert>
      ) : null}
      <Paper sx={{ p: 3 }} variant="outlined">
        <Typography component="h3" variant="h5">
          {detail.name}
        </Typography>
        <Typography>groupId: {detail.id}</Typography>
        <Typography>状態: {detail.status}</Typography>
      </Paper>
      <GroupMembersSection
        detail={detail}
        ownerCount={ownerCount}
        ownerless={ownerless}
        roleOperation={roleOperation}
        roleSource={roleSource}
        roleTarget={roleTarget}
        stale={stale}
        onRequestRemove={requestRemove}
        onRequestRoleChange={requestRoleChange}
        onSelectRoleSource={selectRoleSource}
      />
      <GroupInvitationsSection
        invitations={detail.invitations}
        invitationsTruncated={detail.invitationsTruncated}
        stale={stale}
        onRequestRevoke={requestRevokeInvitation}
      />
      <Alert severity="info" variant="outlined">
        この画面では所属またはpending招待だけを変更します。家計データ、招待トークン、Clerkユーザーは変更しません。
      </Alert>
      <SystemAdminInvitationRevokeDialog
        confirming={invitationSaving}
        error={invitationError}
        group={sourceGroup}
        invitation={invitationTarget}
        onCancel={cancelRevokeInvitation}
        onConfirm={(reason) => void executeRevokeInvitation(reason)}
        open={invitationTarget !== null}
      />
      <SystemAdminMembershipChangeDialog
        confirming={confirming}
        environment={detail.environment}
        error={operationError}
        onCancel={cancelRemove}
        onConfirm={(reason) => void executeRemove(reason)}
        open={dialogMember !== null}
        operation="remove"
        sourceGroup={sourceGroup}
        target={removeTarget}
      />
      <SystemAdminMembershipChangeDialog
        confirming={roleSaving}
        currentRole={roleTarget?.role}
        environment={detail.environment}
        error={roleError}
        newRole={roleNewRole}
        onCancel={cancelRoleOperation}
        onConfirm={(reason) => void executeRoleOperation(reason)}
        open={
          roleTarget !== null &&
          roleOperation !== null &&
          (roleOperation !== "owner_transfer" || roleSource !== null)
        }
        operation={roleOperation ?? "role_change"}
        sourceGroup={sourceGroup}
        sourceUser={roleSourceUser}
        target={roleDialogTarget}
      />
      <GroupOwnerlessRecoveryDialog
        error={recoveryError}
        group={sourceGroup}
        onCancel={cancelRecovery}
        onConfirm={executeRecovery}
        onReasonChange={setRecoveryReason}
        open={recoveryTarget !== null}
        reason={recoveryReason}
        recovering={recovering}
        target={recoveryTarget}
      />
    </SystemAdminPageFrame>
  );
}
