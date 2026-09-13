/**
 * ManagementAuditLog ポートの Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  ManagementAuditLogReadRepository,
  ManagementAuditLogRecorder,
} from "../../domain/groups/managementAuditLogRepository";
import type { ManagementAuditLogRecord } from "../../domain/groups/managementAudit";

function auditDocToFields(doc: Doc<"managementAuditLogs">): ManagementAuditLogRecord {
  return {
    id: doc._id,
    groupId: doc.groupId,
    actorUserId: doc.actorUserId,
    action: doc.action,
    targetKind: doc.targetKind,
    targetId: doc.targetId,
    targetLabel: doc.targetLabel,
    beforeValue: doc.beforeValue,
    afterValue: doc.afterValue,
    createdAt: doc.createdAt,
  };
}

/** 監査ログの記録（mutation コンテキスト向け）。 */
export function createManagementAuditLogRecorder(
  ctx: Pick<MutationCtx, "db">,
): ManagementAuditLogRecorder {
  return {
    async record(entry) {
      return await ctx.db.insert("managementAuditLogs", {
        ...entry,
        groupId: entry.groupId as Id<"groups">,
        createdAt: Date.now(),
      } as Omit<Doc<"managementAuditLogs">, "_id" | "_creationTime">);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createManagementAuditLogReadRepository(
  ctx: Pick<QueryCtx, "db">,
): ManagementAuditLogReadRepository {
  return {
    async listByGroupDesc(groupId, limit) {
      const query = ctx.db
        .query("managementAuditLogs")
        .withIndex("by_group_id_and_created_at", (q) => q.eq("groupId", groupId as Id<"groups">))
        .order("desc");
      const docs = limit === undefined ? await query.collect() : await query.take(limit);
      return docs.map(auditDocToFields);
    },
  };
}
