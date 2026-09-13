import { v } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  MANAGEMENT_AUDIT_ACTION_LABELS,
  managementAuditLogListItemValidator,
} from "./lib/managementAuditLogModel";
import { requireGroupOwner } from "./membership";
import {
  listManagementAuditLogs as listManagementAuditLogsUsecase,
  MANAGEMENT_AUDIT_LOG_LIST_LIMIT,
} from "../../lib/usecase/groups/listManagementAuditLogs";
import { createGroupQueryDeps } from "../../lib/convex/groups/groupUsecaseDeps";

export { MANAGEMENT_AUDIT_LOG_LIST_LIMIT };

export async function listManagementAuditLogsHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupOwner(ctx);

  const logs = await listManagementAuditLogsUsecase({ groupId }, createGroupQueryDeps(ctx));
  return logs.map((log) => ({
    _id: log.logId as Id<"managementAuditLogs">,
    action: log.action,
    actionLabel: MANAGEMENT_AUDIT_ACTION_LABELS[log.action],
    actorDisplayName: log.actorDisplayName,
    targetLabel: log.targetLabel,
    beforeValue: log.beforeValue,
    afterValue: log.afterValue,
    createdAt: log.createdAt,
  }));
}

export const listManagementAuditLogs = query({
  args: {},
  returns: v.array(managementAuditLogListItemValidator),
  handler: listManagementAuditLogsHandler,
});
