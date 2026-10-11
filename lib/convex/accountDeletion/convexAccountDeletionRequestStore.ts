/**
 * AccountDeletionRequestStore の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  AccountDeletionRequestReader,
  AccountDeletionRequestRecord,
  AccountDeletionRequestStore,
} from "../../domain/accountDeletion/request";

function requestDocToRecord(doc: Doc<"accountDeletionRequests">): AccountDeletionRequestRecord {
  return {
    id: doc._id,
    userId: doc.userId,
    clerkUserId: doc.clerkUserId,
    recipientEmailSnapshot: doc.recipientEmailSnapshot,
    status: doc.status,
    leftGroupCount: doc.leftGroupCount,
    deletedGroupCount: doc.deletedGroupCount,
    attemptCount: doc.attemptCount,
    maxAttempts: doc.maxAttempts,
    nextRetryAt: doc.nextRetryAt,
    lastErrorCode: doc.lastErrorCode,
    lastErrorMessage: doc.lastErrorMessage,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    identityDeletedAt: doc.identityDeletedAt,
    completedAt: doc.completedAt,
    preparationCursor: doc.preparationCursor,
    preparationCompletedAt: doc.preparationCompletedAt,
  };
}

function createReader(ctx: Pick<QueryCtx, "db">): AccountDeletionRequestReader {
  return {
    async get(requestId) {
      const doc = await ctx.db.get(requestId as Id<"accountDeletionRequests">);
      return doc === null ? null : requestDocToRecord(doc);
    },
    async listByUser(userId, limit) {
      const docs = await ctx.db
        .query("accountDeletionRequests")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .take(limit);
      return docs.map(requestDocToRecord);
    },
  };
}

export function createAccountDeletionRequestReader(
  ctx: Pick<QueryCtx, "db">,
): AccountDeletionRequestReader {
  return createReader(ctx);
}

export function createAccountDeletionRequestStore(
  ctx: Pick<MutationCtx, "db">,
): AccountDeletionRequestStore {
  return {
    ...createReader(ctx),
    async insert(fields) {
      return await ctx.db.insert(
        "accountDeletionRequests",
        fields as Omit<Doc<"accountDeletionRequests">, "_id" | "_creationTime">,
      );
    },
    async patch(requestId, fields) {
      await ctx.db.patch(
        requestId as Id<"accountDeletionRequests">,
        fields as Partial<Doc<"accountDeletionRequests">>,
      );
    },
    async listCompletedBefore(cutoff, limit) {
      const docs = await ctx.db
        .query("accountDeletionRequests")
        .withIndex("by_status_and_updated_at", (q) =>
          q.eq("status", "completed").lt("updatedAt", cutoff),
        )
        .take(limit);
      return docs.map(requestDocToRecord);
    },
    async listFailedIdentityDeletedAfter(cutoff, limit) {
      // identityDeletedAt 未設定は index 上で数値より小さく並ぶため、gt(cutoff) で読み飛ばされる。
      const docs = await ctx.db
        .query("accountDeletionRequests")
        .withIndex("by_status_and_identity_deleted_at", (q) =>
          q.eq("status", "failed").gt("identityDeletedAt", cutoff),
        )
        .take(limit);
      return docs.map(requestDocToRecord);
    },
    async listFailedIdentityDeletedAtOrBefore(cutoff, limit) {
      // 下限 0 で identityDeletedAt 未設定（index 上で数値より小さい）を除外する。
      const docs = await ctx.db
        .query("accountDeletionRequests")
        .withIndex("by_status_and_identity_deleted_at", (q) =>
          q.eq("status", "failed").gte("identityDeletedAt", 0).lte("identityDeletedAt", cutoff),
        )
        .take(limit);
      return docs.map(requestDocToRecord);
    },
    async delete(requestId) {
      await ctx.db.delete(requestId as Id<"accountDeletionRequests">);
    },
  };
}
