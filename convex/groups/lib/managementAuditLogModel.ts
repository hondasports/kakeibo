import {
  MANAGEMENT_AUDIT_ACTIONS,
  MANAGEMENT_AUDIT_TARGET_KINDS,
  type ManagementAuditAction,
} from "../../../lib/domain/groups/managementAudit";
export type {
  ManagementAuditAction,
  ManagementAuditTargetKind,
} from "../../../lib/domain/groups/managementAudit";
import { v } from "convex/values";

export const managementAuditActionValidator = v.union(
  ...MANAGEMENT_AUDIT_ACTIONS.map((value) => v.literal(value)),
);

export const managementAuditTargetKindValidator = v.union(
  ...MANAGEMENT_AUDIT_TARGET_KINDS.map((value) => v.literal(value)),
);

export const MANAGEMENT_AUDIT_ACTION_LABELS: Record<ManagementAuditAction, string> = {
  group_name_changed: "グループ名を変更",
  member_removed: "メンバーをグループから外す",
  invitation_revoked: "招待を取り消す",
  member_role_changed: "メンバーのロールを変更",
  owner_transferred: "オーナー権限を譲渡",
  group_archived: "グループをアーカイブ",
  group_deleted: "グループを削除",
  system_admin_granted: "システム管理者権限を付与",
  system_admin_revoked: "システム管理者権限を剥奪",
  system_admin_delegated: "システム管理者による操作代行",
  spending_bulk_category_changed: "支出明細のカテゴリを一括変更",
  spending_bulk_deleted: "支出明細を一括削除",
};

export const managementAuditLogListItemValidator = v.object({
  _id: v.id("managementAuditLogs"),
  action: managementAuditActionValidator,
  actionLabel: v.string(),
  actorDisplayName: v.string(),
  targetLabel: v.union(v.string(), v.null()),
  beforeValue: v.union(v.string(), v.null()),
  afterValue: v.union(v.string(), v.null()),
  createdAt: v.number(),
});
