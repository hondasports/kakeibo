import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { SystemAdminAction } from "../components/SystemAdminActionDialog";
import type { SystemAdminListItem, UserSearchItem } from "../types";

export type StatusFilter = "active" | "revoked";
export type SearchType = "displayName" | "email" | "userId";

type ManagementContext = {
  status: string;
  environment: "development" | "preview" | "production";
  userId?: string;
} | null;

export function useSystemAdminManagement() {
  const context = useQuery(api.systemAdmins.getMySystemAdminContext, {}) as ManagementContext;
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>("active");
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<SearchType>("displayName");
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<UserSearchItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<SystemAdminListItem | UserSearchItem | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<SystemAdminAction | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const environment = context?.environment ?? "development";
  const list = useQuery(api.systemAdmins.listSystemAdmins, {
    paginationOpts: { numItems: 20, cursor },
    status: statusFilter,
  });
  const searchUsers = useAction(api.systemAdminSearch.searchUsers);
  const grant = useMutation(api.systemAdmins.grantSystemAdmin);
  const revoke = useMutation(api.systemAdmins.revokeSystemAdmin);

  const setStatusFilter = (value: StatusFilter) => {
    setStatusFilterState(value);
    setCursor(null);
  };

  const runSearch = async () => {
    const query = searchQuery.trim();
    setSearching(true);
    setSearchError(false);
    setCandidates([]);
    setHasSearched(true);
    try {
      const result = await searchUsers({
        queryType: searchType,
        query,
        paginationOpts: { numItems: 10, cursor: null },
      });
      setCandidates(result.page as UserSearchItem[]);
    } catch {
      setSearchError(true);
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  const openAction = (target: SystemAdminListItem | UserSearchItem, action: SystemAdminAction) => {
    setMutationError("");
    setSelectedTarget(target);
    setPendingAction(action);
  };

  const executeAction = async (reason: string) => {
    if (!selectedTarget || !pendingAction) return;
    setSaving(true);
    setMutationError("");
    try {
      const targetUserId =
        "targetUserId" in selectedTarget ? selectedTarget.targetUserId : selectedTarget.id;
      if (pendingAction === "revoke") {
        await revoke({ targetUserId: targetUserId as never, reason });
      } else {
        await grant({ targetUserId: targetUserId as never, reason });
      }
      setPendingAction(null);
      setSelectedTarget(null);
      setSnackbar(
        `${selectedTarget.displayName} を${pendingAction === "revoke" ? "剥奪" : pendingAction === "regrant" ? "再付与" : "付与"}しました`,
      );
      setCandidates([]);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "操作に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const isSelf = (target: SystemAdminListItem | UserSearchItem): boolean =>
    ("isSelf" in target && Boolean(target.isSelf)) ||
    Boolean(
      context?.status === "active" &&
      context.userId === ("targetUserId" in target ? target.targetUserId : target.id),
    );

  return {
    statusFilter,
    setStatusFilter,
    searchType,
    setSearchType,
    searchQuery,
    setSearchQuery,
    candidates,
    hasSearched,
    searching,
    searchError,
    runSearch,
    selectedTarget,
    pendingAction,
    mutationError,
    saving,
    snackbar,
    openAction,
    executeAction,
    isSelf,
    environment,
    list,
    setCursor,
    setPendingAction,
    setSelectedTarget,
    setSnackbar,
  };
}
