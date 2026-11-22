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

// ConvexのドキュメントID形式（32桁の英小文字・数字）。形式外の文字列は v.id() が拒否するため、
// クエリへ渡す前に画面側で弾く。
const CONVEX_ID_PATTERN = /^[a-z0-9]{32}$/;
export const isInvalidConvexIdInput = (value: string) =>
  value.trim() !== "" && !CONVEX_ID_PATTERN.test(value.trim());

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
  // 入力中のドラフトのエラー。開始 > 終了 の間は項目エラーを出し、クエリは確定前の条件のまま。
  const dateRangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);
  const actorInvalid = isInvalidConvexIdInput(actor);
  const targetInvalid = isInvalidConvexIdInput(target);
  const groupIdInvalid = isInvalidConvexIdInput(groupId);
  // 確定済みの条件が不正ならクエリを止める（applyは不正値を確定しないが保険として残す）。
  const appliedRangeInvalid = Boolean(from !== undefined && to !== undefined && from > to);
  const appliedIdsInvalid =
    isInvalidConvexIdInput(applied.actor) ||
    isInvalidConvexIdInput(applied.target) ||
    isInvalidConvexIdInput(applied.groupId);
  const querySkipped = appliedRangeInvalid || appliedIdsInvalid;

  const logs = useQuery(
    api.systemAdmins.listSystemAdminAuditLogs,
    querySkipped
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
    // 不正なドラフト（逆転した期間・形式外のID）は確定しない。
    if (dateRangeInvalid || actorInvalid || targetInvalid || groupIdInvalid) return;
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
    actorInvalid,
    targetInvalid,
    groupIdInvalid,
  };
}
