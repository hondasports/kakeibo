/**
 * GroupDeletionRecipientStore の Convex 実装。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  GroupDeletionRecipientRecord,
  GroupDeletionRecipientStore,
} from "../../domain/groupDeletion/groupDeletionRecipientStore";

function recipientDocToRecord(
  doc: Doc<"groupDeletionNotificationRecipients">,
): GroupDeletionRecipientRecord {
  return {
    id: doc._id,
    jobId: doc.jobId,
    recipientUserId: doc.recipientUserId,
    startedHandledAt: doc.startedHandledAt,
    completedHandledAt: doc.completedHandledAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const UNTREATED_INDEX = {
  started: "by_job_id_and_started_handled_at",
  completed: "by_job_id_and_completed_handled_at",
} as const;

export function createGroupDeletionRecipientStore(
  ctx: Pick<MutationCtx, "db">,
): GroupDeletionRecipientStore {
  return {
    async paginateGroupMembers(groupId, cursor, limit) {
      const page = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">))
        .paginate({ cursor, numItems: limit });
      return {
        page: page.page.map((member) => ({ userId: member.userId })),
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      };
    },
    async findRecipient(jobId, recipientUserId) {
      const doc = await ctx.db
        .query("groupDeletionNotificationRecipients")
        .withIndex("by_job_id_and_recipient_user_id", (q) =>
          q.eq("jobId", jobId as Id<"groupDeletionJobs">).eq("recipientUserId", recipientUserId),
        )
        .unique();
      return doc === null ? null : recipientDocToRecord(doc);
    },
    async insertRecipient(fields) {
      return await ctx.db.insert("groupDeletionNotificationRecipients", {
        ...fields,
        jobId: fields.jobId as Id<"groupDeletionJobs">,
      });
    },
    async listUnnotified(jobId, event, limit) {
      const docs = await ctx.db
        .query("groupDeletionNotificationRecipients")
        .withIndex(UNTREATED_INDEX[event], (q) =>
          q.eq("jobId", jobId as Id<"groupDeletionJobs">).eq(`${event}HandledAt`, undefined),
        )
        .take(limit);
      return docs.map(recipientDocToRecord);
    },
    async markHandled(recipientId, event, handledAt) {
      const field = event === "started" ? "startedHandledAt" : "completedHandledAt";
      await ctx.db.patch(recipientId as Id<"groupDeletionNotificationRecipients">, {
        [field]: handledAt,
        updatedAt: handledAt,
      });
    },
    async takeRecipients(jobId, limit) {
      const docs = await ctx.db
        .query("groupDeletionNotificationRecipients")
        .withIndex("by_job_id", (q) => q.eq("jobId", jobId as Id<"groupDeletionJobs">))
        .take(limit);
      return docs.map(recipientDocToRecord);
    },
    async deleteRecipient(recipientId) {
      await ctx.db.delete(recipientId as Id<"groupDeletionNotificationRecipients">);
    },
  };
}
