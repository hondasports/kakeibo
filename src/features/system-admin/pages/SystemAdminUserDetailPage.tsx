import { Alert } from "@mui/material";
import { useParams } from "react-router-dom";
import { SystemAdminMembershipChangeDialog } from "../components/SystemAdminMembershipChangeDialog";
import { UserInvitationsSection } from "../components/UserInvitationsSection";
import { UserMembershipsSection } from "../components/UserMembershipsSection";
import { UserProfileCard } from "../components/UserProfileCard";
import { useSystemAdminUserDetail } from "../hooks/useSystemAdminUserDetail";
import {
  SystemAdminBackLink,
  SystemAdminEmptyState,
  SystemAdminErrorState,
  SystemAdminPageFrame,
} from "./SystemAdminPageFrame";
import { LoadingDetail } from "../components/LoadingDetail";

export function SystemAdminUserDetailPage() {
  const { userId } = useParams();
  const {
    detail,
    error,
    success,
    setSuccess,
    groupQuery,
    setGroupQuery,
    candidates,
    selectedSource,
    selectSource,
    dialog,
    confirming,
    operationError,
    requestOperation,
    cancelDialog,
    executeOperation,
  } = useSystemAdminUserDetail(userId);

  if (error) {
    return (
      <SystemAdminPageFrame title="ユーザー詳細">
        <SystemAdminErrorState />
      </SystemAdminPageFrame>
    );
  }

  if (detail === undefined) {
    return (
      <SystemAdminPageFrame title="ユーザー詳細">
        <LoadingDetail />
      </SystemAdminPageFrame>
    );
  }

  if (detail === null) {
    return (
      <SystemAdminPageFrame title="ユーザー詳細">
        <SystemAdminEmptyState message="対象ユーザーが見つかりません。" />
        <SystemAdminBackLink to="/admin/users">ユーザー検索へ戻る</SystemAdminBackLink>
      </SystemAdminPageFrame>
    );
  }

  return (
    <SystemAdminPageFrame title="ユーザー詳細">
      <SystemAdminBackLink to="/admin/users">ユーザー検索へ戻る</SystemAdminBackLink>
      {success ? (
        <Alert onClose={() => setSuccess("")} severity="success">
          {success}
        </Alert>
      ) : null}
      <UserProfileCard detail={detail} onClearActive={() => requestOperation("clear_active")} />
      <UserMembershipsSection
        candidates={candidates}
        detail={detail}
        groupQuery={groupQuery}
        selectedSource={selectedSource}
        onGroupQueryChange={setGroupQuery}
        onRequestOperation={requestOperation}
        onSelectSource={selectSource}
      />
      <UserInvitationsSection
        invitations={detail.invitations}
        invitationsTruncated={detail.invitationsTruncated}
      />
      <Alert severity="info" variant="outlined">
        変更対象は所属とactiveGroupIdだけです。家計データ、招待トークン、Clerkアカウントは移動・削除しません。
      </Alert>
      <SystemAdminMembershipChangeDialog
        confirming={confirming}
        environment={detail.environment}
        error={operationError}
        onCancel={cancelDialog}
        onConfirm={(reason) => void executeOperation(reason)}
        open={dialog !== null}
        operation={dialog?.operation ?? "add"}
        sourceGroup={dialog?.sourceGroup}
        target={{
          id: detail.id,
          displayName: detail.displayName,
          email: detail.email,
          activeGroupId: detail.activeGroupId,
        }}
        targetGroup={dialog?.targetGroup}
      />
    </SystemAdminPageFrame>
  );
}
