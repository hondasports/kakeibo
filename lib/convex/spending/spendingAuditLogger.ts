/**
 * SpendingAuditLogger の Convex 実装。
 * 支出一括操作の監査を managementAuditLogs へ記録する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { recordManagementAuditLog } from "../../../convex/groups/lib/managementAuditLog";
import type { SpendingAuditLogger } from "../../domain/spending/spendingAuditLogger";

export function createSpendingAuditLogger(ctx: Pick<MutationCtx, "db">): SpendingAuditLogger {
  return {
    async record(entry) {
      await recordManagementAuditLog(ctx, {
        groupId: entry.groupId as Id<"groups">,
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetKind: "group",
        targetId: entry.groupId,
        targetLabel: entry.targetLabel,
        afterValue: entry.afterValue,
      });
    },
  };
}
