import { useState } from "react";
import { formatGroupRoleLabel } from "../../../../lib/domain/groups/role";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { useAuth, useUser } from "@clerk/react";
import { getClerkUserFriendlyDisplayName } from "../../auth";
import { GroupMemberList } from "./GroupMemberList";
import { GroupManagementAuditLogList } from "./GroupManagementAuditLogList";
import { GroupSettingsSection } from "./GroupSettingsSection";
import { GroupInviteSection } from "./GroupInviteSection";
import { GroupRenameSection } from "./GroupRenameSection";
import { GroupInviteCancelDialog } from "./GroupInviteCancelDialog";
import { GroupRoleChangeDialog } from "./GroupRoleChangeDialog";
import {
  GroupSettingsProvider,
  useGroupSettings,
  useHasGroupSettingsProvider,
} from "./GroupSettingsProvider";
import { useGroupSettingsFeedback } from "../hooks/useGroupSettingsFeedback";
import { useGroupInviteManagement } from "../hooks/useGroupInviteManagement";
import { useGroupRenameManagement } from "../hooks/useGroupRenameManagement";
import { useGroupRoleManagement } from "../hooks/useGroupRoleManagement";

type GroupSettingsPanelProps = {
  defaultExpanded?: boolean;
};

function GroupSettingsPanelContent({ defaultExpanded = true }: GroupSettingsPanelProps) {
  const { userId } = useAuth();
  const { user } = useUser();
  const {
    cancelPendingGroupInvitation,
    changeMemberRole,
    group,
    groups,
    inviteMember,
    managementAuditLogs,
    members,
    pendingInvitations,
    setActiveGroup,
    updateGroupName,
  } = useGroupSettings();

  const { error, savingTarget, setError, setSavingTarget, setSnackbar, snackbar } =
    useGroupSettingsFeedback();
  const [isManagementOpen, setIsManagementOpen] = useState(defaultExpanded);

  const invite = useGroupInviteManagement({
    cancelPendingGroupInvitation,
    inviteMember,
    savingTarget,
    setError,
    setSavingTarget,
    setSnackbar,
  });

  const rename = useGroupRenameManagement({
    groupId: group?._id,
    groupName: group?.name,
    setActiveGroup,
    setError,
    setSavingTarget,
    setSnackbar,
    updateGroupName,
  });

  const role = useGroupRoleManagement({
    changeMemberRole,
    savingTarget,
    setError,
    setSavingTarget,
    setSnackbar,
  });

  const ownerCount = members?.filter((member) => member.role === "owner").length ?? 0;

  if (
    group === undefined ||
    members === undefined ||
    groups === undefined ||
    (group?.role === "owner" &&
      (pendingInvitations === undefined || managementAuditLogs === undefined))
  ) {
    return (
      <Stack aria-label="グループ設定を読み込んでいます" spacing={1.5}>
        <CircularProgress size={20} />
        <Typography color="text.secondary" variant="body2">
          グループ設定を読み込んでいます。
        </Typography>
      </Stack>
    );
  }

  if (group === null) {
    return (
      <Stack spacing={2}>
        <Typography component="h2" variant="h5">
          グループ
        </Typography>
        <Alert severity="info" variant="outlined">
          グループ作成後にメンバー管理を利用できます。
        </Alert>
      </Stack>
    );
  }

  const isOwner = group.role === "owner";
  const canSwitchGroups = groups.length > 1;
  const currentUserDisplayName = getClerkUserFriendlyDisplayName(user);

  return (
    <>
      <Stack spacing={3}>
        <Box>
          <Typography component="h2" variant="h5">
            グループ
          </Typography>
          <Typography color="text.secondary" variant="body2">
            現在のグループとメンバー・招待の状態を確認します。
          </Typography>
        </Box>

        {error ? (
          <Alert severity="error" variant="outlined">
            {error}
          </Alert>
        ) : null}

        <Box className="settings-row group-settings-summary">
          <Typography color="text.secondary" variant="body2">
            現在のグループ
          </Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{group.name}</Typography>
            <Typography color="text.secondary" variant="body2">
              {members.length}人・{formatGroupRoleLabel(group.role)}
              {isOwner ? `・保留中の招待 ${pendingInvitations?.length ?? 0}件` : ""}
            </Typography>
          </Box>
          <Button
            aria-controls="group-management-content"
            aria-expanded={isManagementOpen}
            onClick={() => setIsManagementOpen((open) => !open)}
            sx={{ justifySelf: { md: "end" } }}
            variant="outlined"
          >
            {isManagementOpen ? "管理を閉じる" : "管理する"}
          </Button>
        </Box>

        <Collapse id="group-management-content" in={isManagementOpen} unmountOnExit>
          <Stack spacing={3}>
            <GroupSettingsSection
              description="現在のグループ名と表示中グループを確認・切り替えします。"
              testId="group-info-section"
              title="グループ情報"
            >
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Chip
                    color={isOwner ? "primary" : "secondary"}
                    label={formatGroupRoleLabel(group.role)}
                  />
                  <Chip label={`${members.length}人`} variant="outlined" />
                </Stack>

                {canSwitchGroups || isOwner ? (
                  <GroupRenameSection
                    activeGroupId={rename.activeGroupId}
                    canSwitchGroups={canSwitchGroups}
                    currentGroupId={group._id}
                    currentGroupName={group.name}
                    groupNameDraft={rename.groupNameDraft}
                    groups={groups}
                    isOwner={isOwner}
                    onSwitchGroup={() => void rename.handleSwitchGroup()}
                    onUpdateGroupName={() => void rename.handleUpdateGroupName()}
                    savingTarget={savingTarget}
                    setActiveGroupId={rename.setActiveGroupId}
                    setGroupNameDraft={rename.setGroupNameDraft}
                  />
                ) : (
                  <Typography variant="body1">{group.name}</Typography>
                )}
              </Stack>
            </GroupSettingsSection>

            <Divider />

            <GroupSettingsSection
              description={
                isOwner
                  ? "所属メンバーを確認し、ロールを変更します。メンバー解除は危険な操作から行います。"
                  : "所属メンバーを確認できます。メンバーの追加・削除はオーナーのみ操作できます。"
              }
              testId="member-management-section"
              title="メンバー管理"
            >
              <GroupMemberList
                currentUserDisplayName={currentUserDisplayName}
                currentUserId={userId}
                isOwner={isOwner}
                members={members}
                onRequestRoleChange={isOwner ? role.handleRequestRoleChange : undefined}
                ownerCount={ownerCount}
                savingTarget={savingTarget}
              />
            </GroupSettingsSection>

            {!isOwner ? (
              <Alert severity="info" variant="outlined">
                招待と削除はオーナーのみ操作できます。
              </Alert>
            ) : null}

            {isOwner ? (
              <>
                <Divider />

                <GroupInviteSection
                  email={invite.email}
                  invitations={pendingInvitations ?? []}
                  onInviteMember={invite.handleInviteMember}
                  onRequestCancel={invite.handleRequestCancelInvitation}
                  savingTarget={savingTarget}
                  setEmail={invite.setEmail}
                />

                <Divider />

                <GroupSettingsSection
                  description="グループ名変更、メンバー解除、招待取り消しなどの管理操作履歴を確認できます。"
                  testId="management-audit-log-section"
                  title="管理操作ログ"
                >
                  <GroupManagementAuditLogList logs={managementAuditLogs ?? []} />
                </GroupSettingsSection>
              </>
            ) : null}
          </Stack>
        </Collapse>
      </Stack>

      <GroupRoleChangeDialog
        onCancel={role.handleCancelRoleChange}
        onConfirm={() => void role.handleConfirmRoleChange()}
        pendingRoleChange={role.pendingRoleChange}
        savingTarget={savingTarget}
      />

      <GroupInviteCancelDialog
        onCancel={invite.handleCancelCancelInvitation}
        onConfirm={() => void invite.handleConfirmCancelInvitation()}
        pendingCancelInvitation={invite.pendingCancelInvitation}
        savingTarget={savingTarget}
      />

      <Snackbar
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        autoHideDuration={3000}
        onClose={() => setSnackbar("")}
        open={snackbar !== ""}
      >
        <Alert onClose={() => setSnackbar("")} severity="success" variant="filled">
          {snackbar}
        </Alert>
      </Snackbar>
    </>
  );
}

export function GroupSettingsPanel(props: GroupSettingsPanelProps) {
  const hasProvider = useHasGroupSettingsProvider();
  if (hasProvider) return <GroupSettingsPanelContent {...props} />;
  return (
    <GroupSettingsProvider>
      <GroupSettingsPanelContent {...props} />
    </GroupSettingsProvider>
  );
}
