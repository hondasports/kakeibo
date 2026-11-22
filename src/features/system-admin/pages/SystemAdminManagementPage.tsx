import type { ReactNode } from "react";
import { Alert, Snackbar } from "@mui/material";
import { SystemAdminActionDialog } from "../components/SystemAdminActionDialog";
import { SystemAdminManagementAdminList } from "../components/SystemAdminManagementAdminList";
import { SystemAdminManagementSearch } from "../components/SystemAdminManagementSearch";
import { SystemAdminErrorBoundary } from "../components/SystemAdminErrorBoundary";
import { SystemAdminErrorState, SystemAdminPageFrame } from "./SystemAdminPageFrame";
import { useSystemAdminManagement } from "../hooks/useSystemAdminManagement";

type ManagementErrorBoundaryProps = {
  children: ReactNode;
};

function ManagementErrorBoundary({ children }: ManagementErrorBoundaryProps) {
  return (
    <SystemAdminErrorBoundary
      label="SystemAdminManagementPage"
      renderError={(retry) => (
        <SystemAdminPageFrame title="システム管理者">
          <SystemAdminErrorState onRetry={retry} />
        </SystemAdminPageFrame>
      )}
    >
      {children}
    </SystemAdminErrorBoundary>
  );
}

export function SystemAdminManagementPage() {
  return (
    <ManagementErrorBoundary>
      <SystemAdminManagementPageContent />
    </ManagementErrorBoundary>
  );
}

function SystemAdminManagementPageContent() {
  const {
    statusFilter,
    setStatusFilter,
    searchType,
    setSearchType,
    searchQuery,
    setSearchQuery,
    candidates,
    candidatesTruncated,
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
  } = useSystemAdminManagement();

  return (
    <SystemAdminPageFrame
      description="既存ユーザーを明示的に選び、管理者権限を安全に委任します。"
      title="システム管理者"
    >
      <SystemAdminManagementSearch
        candidates={candidates}
        candidatesTruncated={candidatesTruncated}
        hasSearched={hasSearched}
        isSelf={isSelf}
        searchError={searchError}
        searchQuery={searchQuery}
        searchType={searchType}
        searching={searching}
        onGrant={(candidate) => openAction(candidate, "grant")}
        onRetry={() => void runSearch()}
        onSearch={() => void runSearch()}
        onSearchQueryChange={setSearchQuery}
        onSearchTypeChange={setSearchType}
      />
      <SystemAdminManagementAdminList
        isSelf={isSelf}
        list={list}
        statusFilter={statusFilter}
        onAction={(admin, action) => openAction(admin, action)}
        onLoadMore={(cursor) => setCursor(cursor)}
        onStatusFilterChange={setStatusFilter}
      />
      <Alert severity="info" variant="outlined">
        付与・剥奪の理由は監査ログに保存されます。家計データは表示されません。
      </Alert>
      <SystemAdminActionDialog
        action={pendingAction ?? "grant"}
        confirming={saving}
        environment={environment}
        error={mutationError}
        onCancel={() => {
          if (!saving) {
            setPendingAction(null);
            setSelectedTarget(null);
          }
        }}
        onConfirm={(reason) => void executeAction(reason)}
        open={pendingAction !== null}
        target={selectedTarget}
      />
      <Snackbar
        autoHideDuration={4000}
        message={snackbar}
        onClose={() => setSnackbar("")}
        open={Boolean(snackbar)}
      />
    </SystemAdminPageFrame>
  );
}
