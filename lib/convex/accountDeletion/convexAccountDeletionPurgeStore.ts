/**
 * AccountDeletionGroupPurgeStore / AccountDeletionUserDataPurgeStore の Convex 実装。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  AccountDeletionGroupPurgeRecord,
  AccountDeletionGroupPurgeStore,
} from "../../domain/accountDeletion/groupPurgeStore";
import type {
  AccountDeletionUserDataPurgeStore,
  AccountDeletionUserPurgeTable,
} from "../../domain/accountDeletion/userDataPurgeStore";

function purgeDocToRecord(doc: Doc<"accountDeletionGroupPurges">): AccountDeletionGroupPurgeRecord {
  return {
    id: doc._id,
    requestId: doc.requestId,
    groupDeletionJobId: doc.groupDeletionJobId,
    targetGroupIdSnapshot: doc.targetGroupIdSnapshot,
    targetGroupNameSnapshot: doc.targetGroupNameSnapshot,
    status: doc.status,
    lastErrorCode: doc.lastErrorCode,
    lastErrorMessage: doc.lastErrorMessage,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt,
  };
}

export function createAccountDeletionGroupPurgeStore(
  ctx: Pick<MutationCtx, "db">,
): AccountDeletionGroupPurgeStore {
  return {
    async takeByRequestAndStatus(requestId, status, limit) {
      const docs = await ctx.db
        .query("accountDeletionGroupPurges")
        .withIndex("by_request_id_and_status", (q) =>
          q.eq("requestId", requestId as Id<"accountDeletionRequests">).eq("status", status),
        )
        .take(limit);
      return docs.map(purgeDocToRecord);
    },
    async takeByRequest(requestId, limit) {
      const docs = await ctx.db
        .query("accountDeletionGroupPurges")
        .withIndex("by_request_id", (q) =>
          q.eq("requestId", requestId as Id<"accountDeletionRequests">),
        )
        .take(limit);
      return docs.map(purgeDocToRecord);
    },
    async findByGroupDeletionJobId(groupDeletionJobId) {
      const doc = await ctx.db
        .query("accountDeletionGroupPurges")
        .withIndex("by_group_deletion_job_id", (q) =>
          q.eq("groupDeletionJobId", groupDeletionJobId as Id<"groupDeletionJobs">),
        )
        .unique();
      return doc === null ? null : purgeDocToRecord(doc);
    },
    async insert(fields) {
      return await ctx.db.insert("accountDeletionGroupPurges", {
        ...fields,
        requestId: fields.requestId as Id<"accountDeletionRequests">,
        groupDeletionJobId: fields.groupDeletionJobId as Id<"groupDeletionJobs">,
      } as Omit<Doc<"accountDeletionGroupPurges">, "_id" | "_creationTime">);
    },
    async patch(purgeId, fields) {
      await ctx.db.patch(
        purgeId as Id<"accountDeletionGroupPurges">,
        fields as Partial<Doc<"accountDeletionGroupPurges">>,
      );
    },
    async delete(purgeId) {
      await ctx.db.delete(purgeId as Id<"accountDeletionGroupPurges">);
    },
  };
}

const USER_PURGE_INDEX: Record<AccountDeletionUserPurgeTable, string> = {
  lineWebhookEvents: "by_user_id_and_created_at",
  lineImageJobs: "by_user_id_and_created_at",
};

export function createAccountDeletionUserDataPurgeStore(
  ctx: Pick<MutationCtx, "db">,
): AccountDeletionUserDataPurgeStore {
  return {
    async takeUserScopedIds(table, userId, limit) {
      const docs = await ctx.db
        .query(table)
        .withIndex(USER_PURGE_INDEX[table] as never, (q) =>
          q.eq("userId" as never, userId as never),
        )
        .take(limit);
      return docs.map((doc) => doc._id as string);
    },
    async deleteDocument(id) {
      await ctx.db.delete(id as Id<AccountDeletionUserPurgeTable>);
    },
  };
}
