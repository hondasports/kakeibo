import { SystemAdminErrorBoundary } from "../components/SystemAdminErrorBoundary";
import { AuditLogDetailDialog } from "../components/AuditLogDetailDialog";
import { AuditLogFilters } from "../components/AuditLogFilters";
import { AuditLogList } from "../components/AuditLogList";
import { formatAction, useSystemAdminAuditLog } from "../hooks/useSystemAdminAuditLog";
import { SystemAdminErrorState, SystemAdminPageFrame } from "./SystemAdminPageFrame";

export function SystemAdminAuditLogPage() {
  return (
    <SystemAdminErrorBoundary
      label="SystemAdminAuditLogPage"
      renderError={(retry) => (
        <SystemAdminPageFrame title="監査ログ">
          <SystemAdminErrorState onRetry={retry} />
        </SystemAdminPageFrame>
      )}
    >
      <SystemAdminAuditLogPageContent />
    </SystemAdminErrorBoundary>
  );
}

function SystemAdminAuditLogPageContent() {
  const {
    logs,
    action,
    setAction,
    actor,
    setActor,
    target,
    setTarget,
    groupId,
    setGroupId,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    setCursor,
    selected,
    setSelected,
    applyFilters,
    clearFilters,
    hasFilter,
    dateRangeInvalid,
    actorInvalid,
    targetInvalid,
    groupIdInvalid,
  } = useSystemAdminAuditLog();

  const handleClear = () => {
    clearFilters();
  };

  return (
    <SystemAdminPageFrame
      description="管理者権限の変更と管理コンソール操作の監査履歴を確認します。"
      title="監査ログ"
    >
      <AuditLogFilters
        action={action}
        actor={actor}
        actorInvalid={actorInvalid}
        dateRangeInvalid={dateRangeInvalid}
        fromDate={fromDate}
        groupIdInvalid={groupIdInvalid}
        groupId={groupId}
        hasFilter={hasFilter}
        target={target}
        targetInvalid={targetInvalid}
        toDate={toDate}
        onActionChange={setAction}
        onActorChange={setActor}
        onApply={applyFilters}
        onClear={handleClear}
        onFromDateChange={setFromDate}
        onGroupIdChange={setGroupId}
        onTargetChange={setTarget}
        onToDateChange={setToDate}
      />
      <AuditLogList
        formatAction={formatAction}
        hasFilter={hasFilter}
        logs={logs}
        onLoadMore={(cursor) => setCursor(cursor)}
        onSelect={(item) => setSelected(item)}
      />
      <AuditLogDetailDialog
        formatAction={formatAction}
        onClose={() => setSelected(null)}
        selected={selected}
      />
    </SystemAdminPageFrame>
  );
}
