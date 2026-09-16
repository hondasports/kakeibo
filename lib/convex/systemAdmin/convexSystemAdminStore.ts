/**
 * SystemAdminStore の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  SystemAdminReadStore,
  SystemAdminRecord,
  SystemAdminStore,
} from "../../domain/systemAdmin/systemAdminStore";

function adminDocToRecord(doc: Doc<"systemAdmins">): SystemAdminRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    grantedAt: doc.grantedAt,
    grantedByUserId: doc.grantedByUserId,
    grantReason: doc.grantReason,
    revokedAt: doc.revokedAt,
    revokedByUserId: doc.revokedByUserId,
    revokeReason: doc.revokeReason,
  };
}

function createReader(ctx: Pick<QueryCtx, "db">): SystemAdminReadStore {
  return {
    async findByUserDocId(userDocId) {
      const doc = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", userDocId as Id<"users">))
        .unique();
      return doc === null ? null : adminDocToRecord(doc);
    },
    async takeByStatus(status, limit) {
      const docs = await ctx.db
        .query("systemAdmins")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(limit);
      return docs.map(adminDocToRecord);
    },
    async paginateByStatus(status, opts) {
      const page = await ctx.db
        .query("systemAdmins")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(opts);
      return { ...page, page: page.page.map(adminDocToRecord) };
    },
  };
}

export function createSystemAdminReadStore(ctx: Pick<QueryCtx, "db">): SystemAdminReadStore {
  return createReader(ctx);
}

export function createSystemAdminStore(ctx: Pick<MutationCtx, "db">): SystemAdminStore {
  return {
    ...createReader(ctx),
    async insert(fields) {
      return await ctx.db.insert(
        "systemAdmins",
        fields as Omit<Doc<"systemAdmins">, "_id" | "_creationTime">,
      );
    },
    async patch(id, fields) {
      await ctx.db.patch(id as Id<"systemAdmins">, fields as Partial<Doc<"systemAdmins">>);
    },
  };
}
