import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";
import type { LineLinkAuditRecord } from "../../domain/lineLink/records";

function toRecord(doc: Doc<"lineLinkAuditLogs">): LineLinkAuditRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    action: doc.action,
    result: doc.result,
    ...(doc.reasonCode === undefined ? {} : { reasonCode: doc.reasonCode }),
    createdAt: doc.createdAt,
  };
}

export function createLineLinkAuditLogStore(ctx: Pick<MutationCtx, "db">): LineLinkAuditLogStore {
  return {
    async insert(fields) {
      await ctx.db.insert("lineLinkAuditLogs", fields);
    },
    async takeByUserId(userId, limit) {
      const docs = await ctx.db
        .query("lineLinkAuditLogs")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .take(limit);
      return docs.map(toRecord);
    },
    async deleteById(auditId) {
      await ctx.db.delete(auditId as Id<"lineLinkAuditLogs">);
    },
  };
}
