import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import {
  getUserDetailApi,
  searchGroupsApi,
  systemAdminMembershipOperationApi,
} from "../../../lib/repositories/systemAdmin";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
  MembershipDialogGroup,
  SystemAdminMembershipOperation,
} from "../components/SystemAdminMembershipChangeDialog";

export type UserDetail = {
  id: string;
  displayName: string;
  userId: string;
  email: string | null;
  activeGroupId: string | null;
  environment: string;
  memberships: { groupId: string; groupName: string; role: "owner" | "member" }[];
  invitations: { groupId: string; groupName: string; status: string }[];
  membershipsTruncated?: boolean;
  invitationsTruncated?: boolean;
};

export type GroupCandidate = { id: string; name: string; status: string };

export type DialogState = {
  operation: SystemAdminMembershipOperation;
  sourceGroup?: MembershipDialogGroup;
  targetGroup?: MembershipDialogGroup;
} | null;

export function useSystemAdminUserDetail(userId: string | undefined) {
  const getUserDetail = useAction(getUserDetailApi());
  const searchGroups = useAction(searchGroupsApi());
  const operate = useMutation(systemAdminMembershipOperationApi());

  const [detail, setDetail] = useState<UserDetail | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<MembershipDialogGroup | undefined>();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirming, setConfirming] = useState(false);
  const [operationError, setOperationError] = useState<string>();
  const [success, setSuccess] = useState("");

  const fetchDetail = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await getUserDetail({ userId: userId as Id<"users"> });
      setDetail(response as UserDetail | null);
    } catch {
      setError(true);
    }
  }, [getUserDetail, userId]);

  const load = useCallback(async () => {
    setDetail(undefined);
    setError(false);
    await fetchDetail();
  }, [fetchDetail]);

  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setDetail(undefined);
    setError(false);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getUserDetail({ userId: userId as Id<"users"> })
      .then((response) => {
        if (!cancelled) setDetail(response as UserDetail | null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [getUserDetail, userId]);

  useEffect(() => {
    let cancelled = false;
    if (groupQuery.trim().length === 0) {
      return;
    }
    void searchGroups({
      queryType: "name",
      query: groupQuery,
      paginationOpts: { numItems: 20, cursor: null },
    })
      .then((response) => {
        if (!cancelled) setCandidates(response.page.filter((group) => group.status === "active"));
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [groupQuery, searchGroups]);

  const selectSource = (source: MembershipDialogGroup) => {
    setSelectedSource(source);
  };

  const requestOperation = (
    operation: SystemAdminMembershipOperation,
    sourceGroup?: MembershipDialogGroup,
    targetGroup?: MembershipDialogGroup,
  ) => {
    setDialog({ operation, sourceGroup, targetGroup });
    setOperationError(undefined);
  };

  const cancelDialog = () => {
    if (confirming) return;
    setDialog(null);
    setOperationError(undefined);
  };

  const executeOperation = async (reason: string) => {
    if (!detail || !dialog) return;
    setConfirming(true);
    setOperationError(undefined);
    try {
      await operate({
        targetUserId: detail.id as Id<"users">,
        operation: dialog.operation,
        sourceGroupId: dialog.sourceGroup?.id as Id<"groups"> | undefined,
        targetGroupId: dialog.targetGroup?.id as Id<"groups"> | undefined,
        reason,
      });
      setDialog(null);
      setSelectedSource(undefined);
      setSuccess("操作を完了しました。監査ログと通知outboxに記録しました。");
      await load();
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "操作に失敗しました");
    } finally {
      setConfirming(false);
    }
  };

  return {
    detail,
    error,
    success,
    setSuccess,
    groupQuery,
    setGroupQuery,
    candidates: groupQuery.trim().length === 0 ? [] : candidates,
    selectedSource,
    selectSource,
    dialog,
    confirming,
    operationError,
    requestOperation,
    cancelDialog,
    executeOperation,
  };
}
