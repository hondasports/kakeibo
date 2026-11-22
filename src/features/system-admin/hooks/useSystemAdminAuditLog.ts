import { api } from "../../../../convex/_generated/api";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";

// 日付フィルタはこのブラウザのタイムゾーンの 0:00〜23:59:59.999 を境にする（両端を含む）。
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

type AppliedFilters = {
  action: SystemAdminAuditAction | "";
  actor: string;
  target: string;
  groupId: string;
  fromDate: string;
  toDate: string;
};

const emptyFilters: AppliedFilters = {
  action: "",
  actor: "",
  target: "",
  groupId: "",
  fromDate: "",
  toDate: "",
};

export function useSystemAdminAuditLog() {
  const [cursor, setCursor] = useState<string | null>(null);
  // 入力中のドラフト。クエリには「絞り込む」を押した時点の内容だけを渡す（打鍵ごとの再取得を防ぐ）。
  const [action, setAction] = useState<SystemAdminAuditAction | "">("");
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const [groupId, setGroupId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>(emptyFilters);
  const [selected, setSelected] = useState<SystemAdminAuditItem | null>(null);

  const from = useMemo(() => parseDateBoundary(applied.fromDate, false), [applied.fromDate]);
  const to = useMemo(() => parseDateBoundary(applied.toDate, true), [applied.toDate]);
  // 開始 > 終了 の間はクエリを止める（項目エラーとして画面に出す）。
  const dateRangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  const logs = useQuery(
    api.systemAdmins.listSystemAdminAuditLogs,
    dateRangeInvalid
      ? "skip"
      : {
          paginationOpts: { numItems: 20, cursor },
          action: applied.action || undefined,
          actorUserId: applied.actor.trim() ? (applied.actor.trim() as Id<"users">) : undefined,
          targetUserId: applied.target.trim() ? (applied.target.trim() as Id<"users">) : undefined,
          groupId: applied.groupId.trim() ? (applied.groupId.trim() as Id<"groups">) : undefined,
          from,
          to,
        },
  );

  const applyFilters = () => {
    setApplied({ action, actor, target, groupId, fromDate, toDate });
    setCursor(null);
  };

  const clearFilters = () => {
    setAction("");
    setActor("");
    setTarget("");
    setGroupId("");
    setFromDate("");
    setToDate("");
    setApplied(emptyFilters);
    setCursor(null);
  };

  const hasFilter = Boolean(
    applied.action ||
    applied.actor.trim() ||
    applied.target.trim() ||
    applied.groupId.trim() ||
    applied.fromDate ||
    applied.toDate,
  );

  return {
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
    cursor,
    setCursor,
    selected,
    setSelected,
    applyFilters,
    clearFilters,
    hasFilter,
    dateRangeInvalid,
  };
}
