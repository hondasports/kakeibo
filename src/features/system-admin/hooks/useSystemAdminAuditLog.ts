import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { SystemAdminAuditAction, SystemAdminAuditItem } from "../types";

const actionLabels: Record<SystemAdminAuditAction, string> = {
  system_admin_granted: "付与",
  system_admin_revoked: "剥奪",
  system_admin_recovered: "復旧",
  system_admin_bootstrapped: "初期登録",
  system_admin_user_searched: "ユーザー検索",
  system_admin_group_searched: "グループ検索",
  system_admin_user_viewed: "ユーザー詳細",
  system_admin_group_viewed: "グループ詳細",
  system_admin_membership_added: "所属追加",
  system_admin_membership_removed: "所属解除",
  system_admin_membership_transferred: "所属移動",
  system_admin_active_group_set: "active設定",
  system_admin_active_group_cleared: "active解除",
  system_admin_group_deletion_resumed: "削除ジョブ再開",
  system_admin_ownerless_group_recovered: "owner不在復旧",
  system_admin_group_role_changed: "role変更",
  system_admin_group_owner_transferred: "owner付替え",
  system_admin_group_invitation_revoked: "pending招待取消",
  system_admin_notification_setting_changed: "通知設定変更",
};

export const actionOptions: Array<{ value: SystemAdminAuditAction | ""; label: string }> = [
  { value: "", label: "すべての操作" },
  ...Object.entries(actionLabels).map(([value, label]) => ({
    value: value as SystemAdminAuditAction,
    label,
  })),
];

export function formatAction(action: SystemAdminAuditAction) {
  return actionLabels[action] ?? action;
}

function parseDateBoundary(value: string, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function useSystemAdminAuditLog() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<SystemAdminAuditAction | "">("");
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<SystemAdminAuditItem | null>(null);

  const from = useMemo(() => parseDateBoundary(fromDate, false), [fromDate]);
  const to = useMemo(() => parseDateBoundary(toDate, true), [toDate]);

  const logs = useQuery(api.systemAdmins.listSystemAdminAuditLogs, {
    paginationOpts: { numItems: 20, cursor },
    action: action || undefined,
    actorUserId: actor.trim() ? (actor.trim() as Id<"users">) : undefined,
    targetUserId: target.trim() ? (target.trim() as Id<"users">) : undefined,
    from,
    to,
  });

  const clearFilters = () => {
    setAction("");
    setActor("");
    setTarget("");
    setFromDate("");
    setToDate("");
    setCursor(null);
  };

  const hasFilter = Boolean(action || actor.trim() || target.trim() || fromDate || toDate);

  return {
    logs,
    action,
    setAction,
    actor,
    setActor,
    target,
    setTarget,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    cursor,
    setCursor,
    selected,
    setSelected,
    clearFilters,
    hasFilter,
  };
}
