import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { LineLinkRequestRecord } from "../../domain/lineLink/records";
import type {
  LineLinkRequestReader,
  LineLinkRequestStore,
} from "../../domain/lineLink/requestStore";

function toRecord(doc: Doc<"lineLinkRequests">): LineLinkRequestRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    stateHash: doc.stateHash,
    nonceHash: doc.nonceHash,
    codeVerifier: doc.codeVerifier,
    status: doc.status,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(doc.claimedAt === undefined ? {} : { claimedAt: doc.claimedAt }),
    ...(doc.completedAt === undefined ? {} : { completedAt: doc.completedAt }),
  };
}

export function createLineLinkRequestReader(ctx: Pick<QueryCtx, "db">): LineLinkRequestReader {
  return {
    async findByStateHash(stateHash) {
      const doc = await ctx.db
        .query("lineLinkRequests")
        .withIndex("by_state_hash", (q) => q.eq("stateHash", stateHash))
        .unique();
      return doc === null ? null : toRecord(doc);
    },
    async getById(requestId) {
      const doc = await ctx.db.get(requestId as Id<"lineLinkRequests">);
      return doc === null ? null : toRecord(doc);
    },
  };
}

export function createLineLinkRequestStore(ctx: Pick<MutationCtx, "db">): LineLinkRequestStore {
  return {
    ...createLineLinkRequestReader(ctx),
    async insert(fields) {
      return await ctx.db.insert("lineLinkRequests", fields);
    },
    async patch(requestId, fields) {
      await ctx.db.patch(requestId as Id<"lineLinkRequests">, fields);
    },
    async takeExpired(now, limit) {
      const docs = await ctx.db
        .query("lineLinkRequests")
        .withIndex("by_expires_at", (q) => q.lte("expiresAt", now))
        .take(limit);
      return docs.map(toRecord);
    },
    async takeByUserId(userId, limit) {
      const docs = await ctx.db
        .query("lineLinkRequests")
        .withIndex("by_user_id_and_expires_at", (q) => q.eq("userId", userId))
        .take(limit);
      return docs.map(toRecord);
    },
    async deleteById(requestId) {
      await ctx.db.delete(requestId as Id<"lineLinkRequests">);
    },
  };
}
