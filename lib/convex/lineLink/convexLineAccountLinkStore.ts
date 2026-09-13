import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { LineAccountLinkRecord } from "../../domain/lineLink/records";
import type {
  LineAccountLinkReader,
  LineAccountLinkStore,
} from "../../domain/lineLink/accountLinkStore";

function toRecord(doc: Doc<"lineAccountLinks">): LineAccountLinkRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    lineUserId: doc.lineUserId,
    status: doc.status,
    linkedAt: doc.linkedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(doc.revokedAt === undefined ? {} : { revokedAt: doc.revokedAt }),
  };
}

export function createLineAccountLinkReader(ctx: Pick<QueryCtx, "db">): LineAccountLinkReader {
  return {
    async listActiveByLineUserId(lineUserId) {
      const docs = await ctx.db
        .query("lineAccountLinks")
        .withIndex("by_line_user_id_and_status", (q) =>
          q.eq("lineUserId", lineUserId).eq("status", "active"),
        )
        .collect();
      return docs.map(toRecord);
    },
    async listActiveByUserId(userId) {
      const docs = await ctx.db
        .query("lineAccountLinks")
        .withIndex("by_user_id_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .collect();
      return docs.map(toRecord);
    },
    async findLatestActiveByUserId(userId) {
      const doc = await ctx.db
        .query("lineAccountLinks")
        .withIndex("by_user_id_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .order("desc")
        .first();
      return doc === null ? null : toRecord(doc);
    },
    async takeByUserId(userId, limit) {
      const docs = await ctx.db
        .query("lineAccountLinks")
        .withIndex("by_user_id_and_status", (q) => q.eq("userId", userId))
        .take(limit);
      return docs.map(toRecord);
    },
  };
}

export function createLineAccountLinkStore(ctx: Pick<MutationCtx, "db">): LineAccountLinkStore {
  return {
    ...createLineAccountLinkReader(ctx),
    async insert(fields) {
      await ctx.db.insert("lineAccountLinks", fields);
    },
    async patch(linkId, fields) {
      await ctx.db.patch(linkId as Id<"lineAccountLinks">, fields);
    },
    async deleteById(linkId) {
      await ctx.db.delete(linkId as Id<"lineAccountLinks">);
    },
  };
}
