/**
 * LineAccountLinkReader の Convex 実装。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { LineAccountLinkRecord } from "../../domain/lineWebhook/records";
import type { LineAccountLinkReader } from "../../domain/lineWebhook/accountLinkReader";

function toRecord(doc: Doc<"lineAccountLinks">): LineAccountLinkRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    lineUserId: doc.lineUserId,
    status: doc.status,
  };
}

export function createLineAccountLinkReader(ctx: Pick<QueryCtx, "db">): LineAccountLinkReader {
  return {
    async listActiveByLineUserId(lineUserId, limit) {
      const docs = await ctx.db
        .query("lineAccountLinks")
        .withIndex("by_line_user_id_and_status", (q) =>
          q.eq("lineUserId", lineUserId).eq("status", "active"),
        )
        .take(limit);
      return docs.map(toRecord);
    },
    async listActiveByUserId(userId, limit) {
      const docs = await ctx.db
        .query("lineAccountLinks")
        .withIndex("by_user_id_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .take(limit);
      return docs.map(toRecord);
    },
  };
}
