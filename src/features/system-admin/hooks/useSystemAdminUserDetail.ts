import { api } from "../../../../convex/_generated/api";
import { useCallback, useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { GroupRole } from "../../../../lib/domain/groups/role";
import type { MembershipOperation } from "../../../../lib/domain/systemAdmin/membershipOperation";
import type { MembershipDialogGroup } from "../components/SystemAdminMembershipChangeDialog";

export type UserDetail = {
  id: string;
  displayName: string;
  userId: string;
  email: string | null;
  activeGroupId: string | null;
  environment: string;
  memberships: { groupId: string; groupName: string; role: GroupRole }[];
  invitations: { groupId: string; groupName: string; status: string }[];
  membershipsTruncated?: boolean;
  invitationsTruncated?: boolean;
};

export type GroupCandidate = { id: string; name: string; status: string; createdAt: number };

type DialogState = {
  operation: MembershipOperation;
  sourceGroup?: MembershipDialogGroup;
  targetGroup?: MembershipDialogGroup;
} | null;

export function useSystemAdminUserDetail(userId: string | undefined) {
  const getUserDetail = useAction(api.systemAdminSearch.getUserDetail);
  const searchGroups = useAction(api.systemAdminSearch.searchGroups);
  const operate = useMutation(api.systemAdminMembership.systemAdminMembershipOperation);

  const [detail, setDetail] = useState<UserDetail | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  // 先頭20件で打ち切られたか。0件メッセージの文言に使う（true=先頭に無いだけの可能性）。
  const [candidatesTruncated, setCandidatesTruncated] = useState(false);
  const [candidateOutcome, setCandidateOutcome] = useState<
    { query: string; tick: number; state: "done" | "error" } | undefined
  >();
  const [candidateRetryTick, setCandidateRetryTick] = useState(0);
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
    const query = groupQuery.trim();
    if (query.length === 0) return;
    let cancelled = false;
    void searchGroups({
      queryType: "name",
      query: groupQuery,
      paginationOpts: { numItems: 20, cursor: null },
    })
      .then((response) => {
        if (!cancelled) {
          setCandidates(response.page.filter((group) => group.status === "active"));
          setCandidatesTruncated(response.isDone === false);
          setCandidateOutcome({ query: groupQuery, tick: candidateRetryTick, state: "done" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCandidateOutcome({ query: groupQuery, tick: candidateRetryTick, state: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupQuery, searchGroups, candidateRetryTick]);

  const candidateSearch: "idle" | "loading" | "done" | "error" =
    groupQuery.trim().length === 0
      ? "idle"
      : candidateOutcome?.query === groupQuery && candidateOutcome.tick === candidateRetryTick
        ? candidateOutcome.state
        : "loading";

  const selectSource = (source: MembershipDialogGroup) => {
    setSelectedSource((current) => (current?.id === source.id ? undefined : source));
  };

  const requestOperation = (
    operation: MembershipOperation,
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
      const userName = detail.displayName || detail.userId;
      const groupName = dialog.targetGroup?.name ?? dialog.sourceGroup?.name ?? "グループ";
      const sourceName = dialog.sourceGroup?.name ?? "グループ";
      const targetName = dialog.targetGroup?.name ?? "グループ";
      const messageByOperation: Record<MembershipOperation, string> = {
        add: `「${userName}」を「${groupName}」に追加しました`,
        remove: `「${userName}」を「${groupName}」から解除しました`,
        transfer: `「${userName}」を「${sourceName}」から「${targetName}」へ移動しました`,
        set_active: `「${userName}」のactiveグループを「${groupName}」に設定しました`,
        clear_active: `「${userName}」のactiveグループを解除しました`,
      };
      setDialog(null);
      setSelectedSource(undefined);
      setSuccess(`${messageByOperation[dialog.operation]}（監査ログに記録済み）`);
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
    load,
    success,
    setSuccess,
    groupQuery,
    setGroupQuery,
    // 検索中・失敗時は前の検索語の候補を出さない（現在のクエリに対する結果のみ表示）
    candidates: candidateSearch === "done" ? candidates : [],
    candidatesTruncated: groupQuery.trim().length !== 0 && candidatesTruncated,
    candidateSearch,
    retryCandidateSearch: () => setCandidateRetryTick((tick) => tick + 1),
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
