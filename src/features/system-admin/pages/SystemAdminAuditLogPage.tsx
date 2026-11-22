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
    groupRelation,
    setGroupRelation,
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
    applied,
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
        groupRelation={groupRelation}
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
        onGroupRelationChange={setGroupRelation}
        onTargetChange={setTarget}
        onToDateChange={setToDate}
      />
      <SystemAdminErrorBoundary
        key={JSON.stringify(applied)}
        label="AuditLogList"
        renderError={(retry) => <SystemAdminErrorState onRetry={retry} />}
      >
        <AuditLogList
          formatAction={formatAction}
          hasFilter={hasFilter}
          logs={logs}
          onLoadMore={(cursor) => setCursor(cursor)}
          onSelect={(item) => setSelected(item)}
        />
      </SystemAdminErrorBoundary>
      <AuditLogDetailDialog
        formatAction={formatAction}
        onClose={() => setSelected(null)}
        selected={selected}
      />
    </SystemAdminPageFrame>
  );
}
