import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { SystemAdminAuditAction, SystemAdminAuditItem } from "../types";

export const actionOptions: Array<{ value: SystemAdminAuditAction | ""; label: string }> = [
  { value: "", label: "すべての操作" },
  { value: "system_admin_granted", label: "付与" },
  { value: "system_admin_revoked", label: "剥奪" },
  { value: "system_admin_recovered", label: "復旧" },
  { value: "system_admin_bootstrapped", label: "初期登録" },
  { value: "system_admin_user_searched", label: "ユーザー検索" },
  { value: "system_admin_group_searched", label: "グループ検索" },
  { value: "system_admin_user_viewed", label: "ユーザー詳細" },
  { value: "system_admin_group_viewed", label: "グループ詳細" },
  { value: "system_admin_membership_added", label: "所属追加" },
  { value: "system_admin_membership_removed", label: "所属解除" },
  { value: "system_admin_membership_transferred", label: "所属移動" },
  { value: "system_admin_active_group_set", label: "active設定" },
  { value: "system_admin_active_group_cleared", label: "active解除" },
  { value: "system_admin_group_deletion_resumed", label: "削除ジョブ再開" },
  { value: "system_admin_ownerless_group_recovered", label: "owner不在復旧" },
  { value: "system_admin_group_role_changed", label: "role変更" },
  { value: "system_admin_group_owner_transferred", label: "owner付替え" },
  { value: "system_admin_group_invitation_revoked", label: "pending招待取消" },
];

export function formatAction(action: SystemAdminAuditAction) {
  return actionOptions.find((option) => option.value === action)?.label ?? action;
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
